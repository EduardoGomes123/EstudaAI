// Estudaí — envia os avisos no celular (roda de hora em hora, chamada pelo pg_cron do Supabase).
// Cada aluno recebe no máximo 1 aviso por dia, no horário que escolheu, e só quando há algo para fazer
// (prova/trabalho amanhã ou em 3 dias, dever para amanhã) ou se ligou o "lembrete diário de estudo".
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

type Tarefa = { id?: string; origem?: string; tipo?: string; materia?: string; titulo?: string; data?: string | null; feito?: boolean };

const TIPOS: Record<string, string> = { prova: "Prova", trabalho: "Trabalho", dever: "Dever", apresentacao: "Apresentação", outro: "Atividade" };

function diasEntre(hoje: string, data: string) {
  return Math.round((Date.parse(data + "T12:00:00Z") - Date.parse(hoje + "T12:00:00Z")) / 86400000);
}

function nomeTarefa(t: Tarefa) {
  const tipo = TIPOS[t.tipo || "outro"] || "Atividade";
  return t.materia ? `${tipo} de ${t.materia}` : `${tipo}: ${t.titulo || ""}`.trim();
}

function montarAviso(tarefas: Tarefa[], hoje: string, diario: boolean, temRotina: boolean) {
  const pend = tarefas.filter((t) => !t.feito && t.data && /^\d{4}-\d{2}-\d{2}$/.test(t.data));
  const grandes = ["prova", "trabalho", "apresentacao"];
  const amanha = pend.filter((t) => diasEntre(hoje, t.data!) === 1);
  const em3 = pend.filter((t) => grandes.includes(t.tipo || "") && diasEntre(hoje, t.data!) === 3);
  const peso = (t: Tarefa) => (grandes.includes(t.tipo || "") ? 0 : 1);
  const lista = [...amanha.sort((a, b) => peso(a) - peso(b)), ...em3];
  if (lista.length) {
    const p = lista[0];
    const quando = diasEntre(hoje, p.data!) === 1 ? "amanhã" : "em 3 dias";
    const mais = lista.length - 1;
    const title = `📚 ${nomeTarefa(p)} ${quando}`;
    const acao = p.tipo === "prova"
      ? (quando === "amanhã" ? "Que tal fazer o simulado e revisar os flashcards?" : "Bom momento para fazer o resumo e começar a revisar.")
      : p.tipo === "dever" ? "Já deu para adiantar?" : "Bora adiantar hoje?";
    const body = `${acao}${mais > 0 ? ` (+${mais} ${mais === 1 ? "atividade" : "atividades"} na agenda)` : ""}`;
    return { title, body, tag: `estudai-${hoje}` };
  }
  if (diario && temRotina) return { title: "📖 Hora de estudar", body: "Seu bloco de hoje está no cronograma. Vale 30 minutinhos?", tag: `estudai-${hoje}` };
  return null;
}

Deno.serve(async (req) => {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: cfg } = await sb.from("estudai_config").select("chave, valor");
  const conf = Object.fromEntries((cfg || []).map((c) => [c.chave, c.valor]));
  if (!conf.cron_segredo || req.headers.get("x-cron") !== conf.cron_segredo) return new Response("sem permissão", { status: 401 });

  webpush.setVapidDetails("https://github.com/EduardoGomes123/EstudaAI", conf.vapid_publico, conf.vapid_privado);

  // horário de Recife (UTC-3, sem horário de verão)
  const agora = new Date(Date.now() - 3 * 3600 * 1000);
  const corpo = await req.json().catch(() => ({}));
  const hora = Number.isInteger(corpo.hora) ? corpo.hora : agora.getUTCHours();
  const hoje = agora.toISOString().slice(0, 10);

  const { data: subs, error } = await sb.from("estudai_push")
    .select("endpoint, p256dh, auth, diario, ultimo_envio, conta:estudai_contas(dados)")
    .eq("ativo", true).eq("hora", hora);
  if (error) return new Response(JSON.stringify({ erro: error.message }), { status: 500 });

  // atividades das turmas (para quem ainda não abriu o app desde que o professor publicou)
  const turmasCache: Record<string, Tarefa[]> = {};
  async function tarefasDaTurma(codigo: string): Promise<Tarefa[]> {
    if (turmasCache[codigo]) return turmasCache[codigo];
    const { data } = await sb.rpc("estudai_turma_ver", { p_codigo: codigo });
    turmasCache[codigo] = ((data?.tarefas || []) as Tarefa[]).map((t) => ({ ...t, origem: t.id }));
    return turmasCache[codigo];
  }

  let enviados = 0, sem_nada = 0, removidos = 0, falhas = 0;
  for (const s of subs || []) {
    if (s.ultimo_envio === hoje) continue;
    // deno-lint-ignore no-explicit-any
    const dados: any = (s as any).conta?.dados || {};
    let tarefas: Tarefa[] = Array.isArray(dados.tarefas) ? dados.tarefas : [];
    if (dados.turma?.codigo) {
      const jaTem = new Set(tarefas.map((t) => t.origem).filter(Boolean));
      const ignoradas = new Set(Array.isArray(dados.turmaIgnoradas) ? dados.turmaIgnoradas : []);
      for (const t of await tarefasDaTurma(dados.turma.codigo)) if (!jaTem.has(t.origem) && !ignoradas.has(t.origem)) tarefas = [...tarefas, t];
    }
    const aviso = montarAviso(tarefas, hoje, s.diario, Boolean(dados.rotina));
    if (!aviso) { sem_nada++; continue; }
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ ...aviso, url: "/" }), { TTL: 6 * 3600, urgency: "normal" });
      enviados++;
      await sb.from("estudai_push").update({ ultimo_envio: hoje }).eq("endpoint", s.endpoint);
    } catch (e) {
      // deno-lint-ignore no-explicit-any
      const status = (e as any)?.statusCode;
      if (status === 404 || status === 410) { removidos++; await sb.from("estudai_push").delete().eq("endpoint", s.endpoint); }
      else { falhas++; console.log("push falhou", status, String((e as Error)?.message || e).slice(0, 200)); }
    }
  }
  return new Response(JSON.stringify({ hora, hoje, inscritos: subs?.length || 0, enviados, sem_nada, removidos, falhas }), { headers: { "content-type": "application/json" } });
});

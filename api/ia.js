// Estudaí — função da IA (Vercel Serverless Function).
// Recebe fotos do app e devolve JSON com tarefas (modo "agenda")
// ou material de estudo (modo "estudo"), usando a camada grátis do Gemini.
//
// Variáveis de ambiente (Vercel > Project > Settings > Environment Variables):
//   GEMINI_API_KEY  -> obrigatória (pegue grátis em aistudio.google.com)
//   GEMINI_MODEL    -> opcional; sem ela usa gemini-flash-latest (igual ao ResumAI)

// Mesmos apelidos usados no ResumAI: o Google mantém apontando para o modelo mais recente.
const MODELOS_RESERVA = ["gemini-flash-latest", "gemini-flash-lite-latest"];
const MAX_FOTOS = 6;
const MAX_BYTES_TOTAL = 4_000_000; // limite do corpo das funções Vercel é 4,5 MB

const DIAS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

function promptAgenda(hoje) {
  const d = new Date(hoje + "T12:00:00");
  const dia = DIAS[d.getDay()];
  return `Você lê fotos de quadro, agenda escolar, caderno ou bilhete de um estudante brasileiro (ensino fundamental ou médio).
Hoje é ${hoje} (${dia}).

Tarefa: extraia TODAS as atividades escolares com prazo que aparecem na imagem: provas, testes, trabalhos, deveres de casa, apresentações, seminários, entregas, leituras, passeios que exigem algo.

Regras:
- Converta datas para o formato AAAA-MM-DD. Datas como "12/03" são dia/mês. "Próxima quinta", "amanhã", "semana que vem" devem ser calculadas a partir de hoje. Sempre escolha a data futura mais próxima.
- Se não houver data, use null.
- "tipo" deve ser exatamente um destes: "prova", "trabalho", "dever", "apresentacao", "outro".
- "materia": a disciplina (ex.: Matemática, Português, História). Se não souber, use "".
- "titulo": frase curta do que é (ex.: "Prova do capítulo 4 - frações").
- "detalhes": páginas, exercícios, conteúdo, material necessário. Pode ser "".
- Não invente nada que não esteja na imagem.
- Se a imagem não tiver conteúdo escolar ou estiver ilegível, retorne a lista vazia e explique em "aviso".

Responda SOMENTE com JSON neste formato:
{"tarefas":[{"tipo":"prova","materia":"","titulo":"","data":"AAAA-MM-DD","detalhes":""}],"aviso":""}`;
}

function promptHorario() {
  return `Você lê a foto do horário de aulas (grade horária) de um estudante brasileiro do ensino fundamental ou médio.

Para cada dia da semana que aparece, extraia:
- "inicio": horário de início da primeira aula (HH:MM, 24h)
- "fim": horário de término da última aula (HH:MM, 24h)
- "materias": as matérias do dia, sem repetir, na ordem em que aparecem

Use nomes padronizados: Matemática, Português, Redação, Ciências, Física, Química, Biologia, História, Geografia, Inglês, Espanhol, Artes, Educação Física, Filosofia, Sociologia, Ensino Religioso. Ignore intervalo/recreio.
Se os horários não aparecerem, use null. Não invente.
Chaves dos dias: "seg", "ter", "qua", "qui", "sex", "sab". Omita os dias sem aula.
Se a imagem não for um horário escolar, responda {"dias":{},"aviso":"explicação curta"}.

Responda SOMENTE com JSON neste formato:
{"dias":{"seg":{"inicio":"07:00","fim":"12:20","materias":["Matemática","Português"]}},"aviso":""}`;
}

function promptEstudo({ materia, assunto }) {
  return `Você é um professor particular paciente que ajuda um estudante brasileiro do ensino fundamental ou médio a estudar para a prova.
As fotos são páginas do caderno ou do livro dele.${materia ? `\nMatéria: ${materia}.` : ""}${assunto ? `\nA prova/atividade é: ${assunto}.` : ""}

Crie um material de estudo em português do Brasil, com linguagem simples e direta, baseado no conteúdo das fotos. Você pode completar com explicações básicas CORRETAS do mesmo assunto, mas não fuja do tema.

Responda SOMENTE com JSON neste formato:
{
 "titulo": "título curto do assunto",
 "materia": "disciplina",
 "resumo": ["8 a 12 tópicos curtos, cada um com 1 ou 2 frases, do mais importante para o menos importante"],
 "flashcards": [{"frente":"pergunta ou termo","verso":"resposta curta"}],
 "quiz": [{"pergunta":"","opcoes":["","","",""],"correta":0,"explicacao":"por que essa é a certa, em 1 ou 2 frases"}]
}
- Faça de 10 a 15 flashcards e de 8 a 10 perguntas no quiz.
- No quiz, sempre 4 opções, só uma certa, com "correta" sendo o índice (0 a 3). Varie a posição da resposta certa.
- Se as fotos estiverem ilegíveis ou não forem de conteúdo escolar, responda {"erro":"explicação curta"}.`;
}

let res_;
function resposta(status, obj) {
  res_.status(status).setHeader("content-type", "application/json; charset=utf-8");
  res_.send(JSON.stringify(obj));
}

function extrairJSON(texto) {
  if (!texto) return null;
  const limpo = texto.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try { return JSON.parse(limpo); } catch {}
  const ini = limpo.indexOf("{");
  const fim = limpo.lastIndexOf("}");
  if (ini >= 0 && fim > ini) {
    try { return JSON.parse(limpo.slice(ini, fim + 1)); } catch {}
  }
  return null;
}

async function chamarGemini(chave, modelo, partes) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": chave },
    body: JSON.stringify({
      contents: [{ role: "user", parts: partes }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.3 },
    }),
  });
  const corpo = await r.json().catch(() => ({}));
  return { status: r.status, corpo };
}

module.exports = async (req, res) => {
  res_ = res;
  if (req.method !== "POST") return resposta(405, { erro: "Use POST." });

  const chave = process.env.GEMINI_API_KEY;
  if (!chave) return resposta(500, { erro: "A chave GEMINI_API_KEY não foi configurada na Netlify." });

  let dados = req.body;
  if (typeof dados === "string") { try { dados = JSON.parse(dados); } catch { return resposta(400, { erro: "Pedido inválido." }); } }

  const { modo, fotos, hoje, materia, assunto } = dados || {};
  if (!["agenda", "estudo", "horario"].includes(modo)) return resposta(400, { erro: "Modo inválido." });
  if (!Array.isArray(fotos) || fotos.length === 0) return resposta(400, { erro: "Envie pelo menos uma foto." });
  if (fotos.length > MAX_FOTOS) return resposta(400, { erro: `Envie no máximo ${MAX_FOTOS} fotos.` });

  let total = 0;
  for (const f of fotos) {
    if (!f || typeof f.data !== "string" || !/^image\/(jpeg|png|webp)$/.test(f.mime || "")) {
      return resposta(400, { erro: "Formato de foto inválido." });
    }
    total += f.data.length;
  }
  if (total > MAX_BYTES_TOTAL) return resposta(413, { erro: "As fotos ficaram grandes demais. Tente enviar menos fotos." });

  const dataHoje = /^\d{4}-\d{2}-\d{2}$/.test(hoje || "") ? hoje : new Date().toISOString().slice(0, 10);
  const texto = modo === "agenda"
    ? promptAgenda(dataHoje)
    : modo === "horario"
    ? promptHorario()
    : promptEstudo({ materia: String(materia || "").slice(0, 60), assunto: String(assunto || "").slice(0, 200) });

  const partes = [
    { text: texto },
    ...fotos.map((f) => ({ inline_data: { mime_type: f.mime, data: f.data } })),
  ];

  const modelos = [process.env.GEMINI_MODEL, ...MODELOS_RESERVA].filter((m, i, a) => m && a.indexOf(m) === i);

  let ultimoErro = "Não foi possível falar com a IA.";
  for (const modelo of modelos) {
    let r;
    try { r = await chamarGemini(chave, modelo, partes); }
    catch { ultimoErro = "Falha de conexão com a IA."; continue; }

    if (r.status === 404 || r.status === 400 && /not found|not supported/i.test(r.corpo?.error?.message || "")) {
      continue; // modelo não existe/foi desligado: tenta o próximo
    }
    if (r.status === 429) {
      return resposta(429, { erro: "Muita gente usando agora. Espere 1 minuto e tente de novo." });
    }
    if (r.status !== 200) {
      ultimoErro = r.corpo?.error?.message || `Erro ${r.status} da IA.`;
      continue;
    }

    const cand = r.corpo?.candidates?.[0];
    const txt = (cand?.content?.parts || []).map((p) => p.text || "").join("");
    const json = extrairJSON(txt);
    if (!json) { ultimoErro = "A IA respondeu num formato inesperado. Tente de novo."; continue; }
    return resposta(200, { ...json, _modelo: modelo });
  }

  return resposta(502, { erro: ultimoErro });
};

module.exports.config = { maxDuration: 60 };

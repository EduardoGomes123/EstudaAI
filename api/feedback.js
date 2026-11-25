// Estudaí — recebe o feedback dos alunos (Vercel Serverless Function).
//
// Onde o feedback fica:
//   1. Tabela "estudai_feedback" do Supabase (igual ao ResumAI) — precisa das variáveis
//      SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (veja o README).
//   2. Sempre aparece também nos logs da Vercel (Project > Logs, procure "FEEDBACK").
//   3. Opcional: FEEDBACK_URL -> planilha do Google (Apps Script) ou webhook do Discord.

const { inserir } = require("./_supabase");
const { conferirComentario } = require("./_moderacao");

const AREAS = ["geral", "agenda", "cronograma", "resumo", "mapa", "flashcards", "simulado", "enem", "olimpiadas", "ideia", "problema"];

function limpar(v, max) {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

module.exports = async (req, res) => {
  const responder = (status, obj) => {
    res.status(status).setHeader("content-type", "application/json; charset=utf-8");
    res.send(JSON.stringify(obj));
  };
  if (req.method !== "POST") return responder(405, { erro: "Use POST." });

  let d = req.body;
  if (typeof d === "string") { try { d = JSON.parse(d); } catch { return responder(400, { erro: "Pedido inválido." }); } }
  d = d || {};

  const nota = Number.isInteger(d.nota) && d.nota >= 1 && d.nota <= 5 ? d.nota : null;
  const texto = limpar(d.texto, 2000);
  if (!nota && !texto) return responder(400, { erro: "Escolha uma carinha ou escreva algo." });

  const nome = limpar(d.nome, 60);
  const problema = conferirComentario(texto) || conferirComentario(nome);
  if (problema) return responder(400, { erro: problema });

  const item = {
    data: new Date().toISOString(),
    nota,
    area: AREAS.includes(d.area) ? d.area : "geral",
    texto,
    nome,
    contexto: limpar(d.contexto, 200),
    aparelho: limpar(req.headers["user-agent"], 160),
  };

  console.log("FEEDBACK", JSON.stringify(item));

  await inserir("estudai_feedback", {
    nota: item.nota,
    area: item.area,
    texto: item.texto || null,
    nome: item.nome || null,
    contexto: item.contexto || null,
    aparelho: item.aparelho || null,
    visitante: limpar(d.visitante, 40) || null,
  });

  const url = process.env.FEEDBACK_URL;
  if (url) {
    try {
      const discord = /discord(app)?\.com\/api\/webhooks/.test(url);
      const corpo = discord
        ? { content: `**Feedback Estudaí** ${"⭐".repeat(item.nota || 0)}\nÁrea: ${item.area}${item.contexto ? ` (${item.contexto})` : ""}\n${item.texto || "(sem texto)"}${item.nome ? `\n— ${item.nome}` : ""}`.slice(0, 1900) }
        : item;
      await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(corpo),
        redirect: "follow",
      });
    } catch (e) {
      console.log("FEEDBACK_ENVIO_FALHOU", e && e.message);
    }
  }

  return responder(200, { ok: true });
};

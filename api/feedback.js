// Estudaí — recebe o feedback dos alunos (Vercel Serverless Function).
//
// Cada feedback sempre aparece nos logs da Vercel (Project > Logs, procure "FEEDBACK").
// Para guardar numa planilha, crie a variável de ambiente:
//   FEEDBACK_URL -> endereço do Apps Script da planilha do Google (veja o README)
//                   ou de um webhook do Discord.

const AREAS = ["geral", "agenda", "cronograma", "resumo", "mapa", "flashcards", "simulado", "ideia", "problema"];

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

  const item = {
    data: new Date().toISOString(),
    nota,
    area: AREAS.includes(d.area) ? d.area : "geral",
    texto,
    nome: limpar(d.nome, 60),
    contexto: limpar(d.contexto, 200),
    aparelho: limpar(req.headers["user-agent"], 160),
  };

  console.log("FEEDBACK", JSON.stringify(item));

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

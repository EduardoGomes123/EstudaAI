// Estudaí — registra o uso do app na tabela "estudai_uso" do Supabase.
// Não recebe nome, e-mail, fotos nem textos: só um código anônimo do aparelho e qual função foi usada.

const { inserir } = require("./_supabase");

const EVENTOS = ["abriu", "agenda", "horario", "estudo", "mapa", "banco", "enem", "simulado_fim", "flashcards_fim", "instalou", "duvida", "redacao", "foco"];

function limpar(v, max) {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

module.exports = async (req, res) => {
  const fim = (status) => { res.status(status).setHeader("content-type", "application/json; charset=utf-8"); res.send(status === 200 ? '{"ok":true}' : '{"ok":false}'); };
  if (req.method !== "POST") return fim(405);

  let d = req.body;
  if (typeof d === "string") { try { d = JSON.parse(d); } catch { return fim(400); } }
  d = d || {};

  const evento = EVENTOS.includes(d.evento) ? d.evento : null;
  const visitante = limpar(d.visitante, 40).replace(/[^a-z0-9-]/gi, "");
  if (!evento || visitante.length < 8) return fim(400);

  await inserir("estudai_uso", {
    visitante,
    evento,
    detalhe: limpar(d.detalhe, 80) || null,
    aparelho: limpar(req.headers["user-agent"], 160) || null,
  });
  return fim(200);
};

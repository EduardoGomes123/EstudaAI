// Estudaí — busca questões oficiais do ENEM numa base pública e gratuita (api.enem.dev).
// Arquivos que começam com "_" não viram rota na Vercel; este é só um ajudante.
//
// Variável opcional: ENEM_API_URL (padrão https://api.enem.dev/v1)

const BASE = (process.env.ENEM_API_URL || "https://api.enem.dev/v1").replace(/\/$/, "");
const ANOS = Array.from({ length: 15 }, (_, i) => 2009 + i); // 2009 a 2023
const AREAS = {
  matematica: "matematica",
  linguagens: "linguagens",
  natureza: "ciencias-natureza",
  humanas: "ciencias-humanas",
};

const cache = new Map(); // fica guardado enquanto a função estiver "quente"

async function getJSON(url, ms = 9000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { accept: "application/json" } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

function listaDe(j) {
  if (Array.isArray(j)) return j;
  return j?.questions || j?.data || j?.items || [];
}

async function questoesDoAno(ano, idioma) {
  const chave = `${ano}-${idioma}`;
  if (cache.has(chave)) return cache.get(chave);
  const tarefa = (async () => {
    const paginas = await Promise.all([0, 50, 100, 150].map((offset) =>
      getJSON(`${BASE}/exams/${ano}/questions?limit=50&offset=${offset}&language=${idioma}`)
        .then(listaDe).catch(() => [])
    ));
    return paginas.flat();
  })();
  cache.set(chave, tarefa);
  const r = await tarefa;
  if (!r.length) cache.delete(chave);
  return r;
}

function embaralhar(a) {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
  return b;
}

const semAcento = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function normalizar(q) {
  const alts = (q.alternatives || []).map((a, i) => ({
    letra: a.letter || "ABCDE"[i],
    texto: String(a.text || "").trim(),
    arquivo: a.file || null,
    certa: a.isCorrect === true || (q.correctAlternative && a.letter === q.correctAlternative),
  }));
  const correta = alts.findIndex((a) => a.certa);
  if (alts.length < 2 || correta < 0 || alts.some((a) => !a.texto && !a.arquivo)) return null;
  const ano = q.year;
  const numero = q.index;
  return {
    ano,
    numero,
    fonte: `ENEM ${ano} · Questão ${numero}`,
    contexto: String(q.context || "").trim(),
    pergunta: String(q.alternativesIntroduction || "").trim() || "Assinale a alternativa correta.",
    opcoes: alts.map((a) => a.texto || `(alternativa ${a.letra} em imagem)`),
    opcoesImg: alts.map((a) => a.arquivo || null),
    correta,
  };
}

// Sorteia questões oficiais de uma área. "ano" vazio = vários anos.
async function sortearQuestoes({ area, ano, idioma = "ingles", assunto = "", quantidade = 10 }) {
  const disc = AREAS[area];
  if (!disc) throw new Error("Área inválida.");
  const anos = ANOS.includes(+ano) ? [+ano] : embaralhar(ANOS).slice(0, 4);
  const listas = await Promise.all(anos.map((a) => questoesDoAno(a, idioma === "espanhol" ? "espanhol" : "ingles").catch(() => [])));
  let pool = listas.flat()
    .filter((q) => q && q.discipline === disc)
    .map(normalizar)
    .filter(Boolean);
  if (!pool.length) return { questoes: [], aviso: "Não consegui acessar o banco de questões do ENEM agora." };

  let aviso = "";
  const termo = semAcento(assunto).trim();
  if (termo) {
    const palavras = termo.split(/\s+/).filter((p) => p.length > 2);
    const achadas = pool.filter((q) => {
      const txt = semAcento(q.contexto + " " + q.pergunta + " " + q.opcoes.join(" "));
      return palavras.every((p) => txt.includes(p));
    });
    if (achadas.length) pool = achadas;
    else aviso = `Não achei questões sobre "${assunto}" nesses anos; trouxe questões variadas da área.`;
  }
  const questoes = embaralhar(pool).slice(0, quantidade).sort((a, b) => a.ano - b.ano || a.numero - b.numero);
  return { questoes, aviso };
}

module.exports = { sortearQuestoes, AREAS, ANOS };

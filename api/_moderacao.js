// Estudaí — filtro de palavrões, ofensas, links e dados pessoais nos comentários (mesmo filtro do ResumAI).
// Para bloquear mais palavras, é só incluir nas listas.

const WORDS = [
  "porra", "caralho", "caralha", "merda", "puta", "puto", "putaria", "foda", "fodase", "foder", "fodido", "fudido", "fuder",
  "buceta", "boceta", "xoxota", "xereca", "piroca", "pica", "cu", "cuzao", "cuzinho", "arrombado", "arrombada",
  "babaca", "otario", "otaria", "imbecil", "idiota", "retardado", "retardada", "debil", "cretino", "cretina", "escroto", "escrota",
  "corno", "corna", "viado", "veado", "bicha", "sapatao", "vagabundo", "vagabunda", "piranha", "vadia", "safado", "safada",
  "punheta", "punheteiro", "bosta", "cacete", "desgracado", "desgracada",
  "fdp", "pqp", "vsf", "vtnc", "tnc", "krl", "crl", "prr", "mrd", "pnc",
  "fuck", "fucking", "shit", "bitch", "asshole", "dick", "cunt", "bastard",
];
const PHRASES = ["filhodaputa", "filhadaputa", "putaquepariu", "vaisefoder", "vaisefuder", "vaitomarnocu", "tomarnocu", "paunocu", "seufilhoda"];
const SAFE = ["cuidado", "cuidar", "cultura", "curso", "custo", "curto", "curta", "picante", "picanha", "putrido", "computador", "disputa", "reputacao", "fodao"];
const LEET = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s", "!": "i" };

function normalize(s) {
  return String(s)
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[013457@$!]/g, (c) => LEET[c] || c)
    .replace(/[^a-z\s]/g, " ")
    .replace(/([a-z])\1+/g, "$1");
}
const squash = (s) => normalize(s).replace(/\s+/g, "");
const WORD_SET = WORDS.map(squash);
const PHRASE_SET = PHRASES.map(squash);
const SAFE_SET = SAFE.map(squash);
const SHORT = 4;

function temPalavrao(texto) {
  const tokens = normalize(texto).split(/\s+/).filter(Boolean);
  for (const t of tokens) {
    if (SAFE_SET.some((s) => t.startsWith(s))) continue;
    for (const w of WORD_SET) {
      if (t === w) return true;
      if (w.length > SHORT && t.startsWith(w)) return true;
    }
  }
  const all = squash(texto);
  return PHRASE_SET.some((p) => all.includes(p));
}

function temLink(texto) {
  return /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|br|io|xyz|info|site|online)\b)/i.test(texto);
}

// Os usuários são adolescentes: bloqueia telefone e e-mail no comentário
function temDadoPessoal(texto) {
  const digitos = String(texto).replace(/\D/g, " ").split(/\s+/).some((n) => n.length >= 8);
  return digitos || /[^\s@]+@[^\s@]+\.[a-z]{2,}/i.test(texto);
}

// Devolve a mensagem de erro em português, ou "" se pode enviar
function conferirComentario(c) {
  const t = String(c || "").trim();
  if (!t) return "";
  if (temPalavrao(t)) return "Seu comentário tem palavrões ou ofensas. Reescreva de forma respeitosa, por favor.";
  if (temLink(t)) return "Não é possível enviar links no comentário.";
  if (temDadoPessoal(t)) return "Não escreva telefone, e-mail ou outros dados pessoais no comentário.";
  return "";
}

module.exports = { conferirComentario };

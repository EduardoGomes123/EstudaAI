// Estudaí — tira fórmulas em LaTeX ($n$, \frac{1}{2}...) e deixa em texto simples (n, 1/2...).
// Não mexe em valores em dinheiro como "R$ 30,00". (O index.html tem uma cópia desta função.)

const SIMBOLOS = {
  times: "×", div: "÷", cdot: "·", pm: "±", mp: "∓", leq: "≤", le: "≤", geq: "≥", ge: "≥", neq: "≠", ne: "≠",
  approx: "≈", equiv: "≡", infty: "∞", pi: "π", alpha: "α", beta: "β", gamma: "γ", delta: "δ", Delta: "Δ",
  theta: "θ", lambda: "λ", mu: "μ", sigma: "σ", Sigma: "Σ", omega: "ω", Omega: "Ω", rho: "ρ", phi: "φ",
  rightarrow: "→", to: "→", leftarrow: "←", Rightarrow: "⇒", Leftrightarrow: "⇔", in: "∈", notin: "∉",
  subset: "⊂", cup: "∪", cap: "∩", emptyset: "∅", forall: "∀", exists: "∃", angle: "∠", perp: "⊥",
  parallel: "∥", circ: "°", degree: "°", ldots: "…", cdots: "⋯", dots: "…", quad: " ", qquad: "  ",
  sin: "sen", cos: "cos", tan: "tg", log: "log", ln: "ln",
};
const SOBRE = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "+": "⁺", "-": "⁻", "n": "ⁿ", "x": "ˣ", "(": "⁽", ")": "⁾" };
const SOB = { "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉", "+": "₊", "-": "₋" };

function expoente(e, tabela, marca) {
  const s = String(e);
  if ([...s].every((c) => tabela[c])) return [...s].map((c) => tabela[c]).join("");
  return marca + (s.length > 1 ? "(" + s + ")" : s);
}

function formula(t) {
  let s = t;
  for (let i = 0; i < 4; i++) {
    s = s
      .replace(/\\d?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, (_, a, b) => `${/^\w+$/.test(a) ? a : "(" + a + ")"}/${/^\w+$/.test(b) ? b : "(" + b + ")"}`)
      .replace(/\\sqrt\s*\[([^\]]*)\]\s*\{([^{}]*)\}/g, (_, n, a) => `${expoente(n, SOBRE, "")}√(${a})`)
      .replace(/\\sqrt\s*\{([^{}]*)\}/g, (_, a) => (/^\w+$/.test(a) ? `√${a}` : `√(${a})`))
      .replace(/\\(?:text|mathrm|mathbf|textbf|mathit|operatorname|overline|vec|hat|bar)\s*\{([^{}]*)\}/g, "$1");
  }
  s = s
    .replace(/\^\s*\{?\\circ\}?/g, "°")
    .replace(/\^\s*\{([^{}]*)\}/g, (_, e) => expoente(e, SOBRE, "^"))
    .replace(/\^\s*([0-9a-z+\-])/gi, (_, e) => expoente(e, SOBRE, "^"))
    .replace(/_\s*\{([^{}]*)\}/g, (_, e) => expoente(e, SOB, "_"))
    .replace(/_\s*([0-9])/g, (_, e) => SOB[e])
    .replace(/\\left|\\right|\\displaystyle|\\limits/g, "")
    .replace(/\\([a-zA-Z]+)/g, (m, nome) => (nome in SIMBOLOS ? SIMBOLOS[nome] : nome))
    .replace(/\\[,;:! ]/g, " ")
    .replace(/\\([%$&#_{}])/g, "$1")
    .replace(/[{}]/g, "")
    .replace(/[ \t]{2,}/g, " ");
  return s.trim();
}

function semLatex(texto) {
  if (typeof texto !== "string" || !/[$\\]/.test(texto)) return texto;
  let s = texto
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, f) => formula(f))
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, f) => formula(f))
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, f) => formula(f))
    // $...$ (não pega "R$ 30,00": o $ de abertura não pode vir depois de R nem antes de espaço)
    .replace(/(^|[^R\\$])\$(?!\s)([^$\n]+?)\$(?!\d)/g, (m, antes, f) => (/\s$/.test(f) ? m : antes + formula(f)));
  // comandos LaTeX soltos, fora de cifrões
  if (/\\[a-zA-Z]/.test(s)) s = formula(s);
  return s;
}

// aplica em todos os textos de um objeto (menos links)
function limparTudo(x) {
  if (typeof x === "string") return /^https?:\/\//.test(x) ? x : semLatex(x);
  if (Array.isArray(x)) return x.map(limparTudo);
  if (x && typeof x === "object") {
    const o = {};
    for (const [k, v] of Object.entries(x)) o[k] = k === "opcoesImg" ? v : limparTudo(v);
    return o;
  }
  return x;
}

module.exports = { semLatex, limparTudo };

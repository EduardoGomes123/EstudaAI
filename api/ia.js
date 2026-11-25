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
 "quiz": [{"pergunta":"","opcoes":["","","",""],"correta":0,"explicacao":"por que essa é a certa, em 1 ou 2 frases"}],
 "mapa": {"centro":"tema central em até 4 palavras","ramos":[{"titulo":"ideia principal em até 4 palavras","itens":["detalhe curto em até 7 palavras"]}]}
}
- Faça de 10 a 15 flashcards e de 8 a 10 perguntas no quiz.
- No mapa mental, faça de 4 a 6 ramos, cada um com 2 a 4 itens curtos. Use palavras-chave, não frases longas.
- No quiz, sempre 4 opções, só uma certa, com "correta" sendo o índice (0 a 3). Varie a posição da resposta certa.
- Se as fotos estiverem ilegíveis ou não forem de conteúdo escolar, responda {"erro":"explicação curta"}.`;
}

function promptMapa({ titulo, texto }) {
  return `Você cria mapas mentais para estudantes brasileiros do ensino fundamental e médio.
Assunto: ${titulo || "conteúdo de estudo"}.

Com base no resumo abaixo, monte um mapa mental claro, com palavras-chave curtas.

RESUMO:
${texto}

Regras:
- "centro": o tema central, em até 4 palavras.
- De 4 a 6 "ramos", cada um com "titulo" (até 4 palavras) e de 2 a 4 "itens" (até 7 palavras cada).
- Não invente conteúdo fora do resumo.

Responda SOMENTE com JSON neste formato:
{"mapa":{"centro":"","ramos":[{"titulo":"","itens":[""]}]}}`;
}

const PROVAS = {
  enem: "ENEM (Exame Nacional do Ensino Médio): questões contextualizadas, com texto-base, gráfico descrito, tabela ou situação do cotidiano, interdisciplinares, cobrando interpretação e competências da Matriz de Referência do ENEM. 5 alternativas (A a E).",
  obmep: "OBMEP (Olimpíada Brasileira de Matemática das Escolas Públicas), 1ª fase: raciocínio lógico, contagem, aritmética, geometria plana e problemas com enunciado criativo. 5 alternativas.",
  obm: "OBM (Olimpíada Brasileira de Matemática): problemas mais desafiadores de teoria dos números, combinatória, álgebra e geometria, que exigem estratégia. 5 alternativas.",
  canguru: "Canguru de Matemática: questões curtas, lúdicas e visuais (descreva a figura em texto quando precisar), de lógica e matemática, com dificuldade crescente (3, 4 e 5 pontos). 5 alternativas.",
  oba: "OBA (Olimpíada Brasileira de Astronomia e Astronáutica): Sistema Solar, movimentos da Terra e da Lua, estações, constelações, foguetes e astronáutica. 4 ou 5 alternativas.",
  obf: "OBF (Olimpíada Brasileira de Física): cinemática, dinâmica, energia, termologia, óptica e eletricidade, com situações do dia a dia e cálculos. 5 alternativas.",
  obq: "OBQ (Olimpíada Brasileira de Química): estrutura atômica, tabela periódica, ligações, reações, estequiometria e soluções. 5 alternativas.",
  obb: "OBB (Olimpíada Brasileira de Biologia): citologia, genética, evolução, ecologia, fisiologia humana e botânica. 5 alternativas.",
  obr: "OBR (Olimpíada Brasileira de Robótica), modalidade teórica: lógica, sensores, motores, circuitos simples, programação em blocos e algoritmos. 4 ou 5 alternativas.",
  obl: "OBL (Olimpíada Brasileira de Linguística): problemas autossuficientes de lógica linguística, em que o aluno descobre regras de uma língua desconhecida (dada no enunciado) a partir de exemplos. 4 ou 5 alternativas.",
  onhb: "ONHB (Olimpíada Nacional em História do Brasil): interpretação de documentos históricos, imagens descritas e textos de época sobre a História do Brasil. 4 alternativas.",
  olp: "OLP / Olimpíada de Língua Portuguesa: interpretação de texto, gêneros textuais, coesão, coerência e uso da língua. 4 ou 5 alternativas.",
  obi: "OBI (Olimpíada Brasileira de Informática), modalidade iniciação: lógica, padrões, sequências e raciocínio computacional sem programar. 5 alternativas.",
};

function promptBanco({ prova, area, serie, assunto, quantidade }) {
  return `Você é um professor brasileiro especialista em preparar estudantes para provas e olimpíadas.
Prova: ${PROVAS[prova]}
${area ? `Área/matéria: ${area}.` : ""}${serie ? `\nSérie do estudante: ${serie}.` : ""}${assunto ? `\nAssunto pedido: ${assunto}.` : ""}

Crie ${quantidade} questões INÉDITAS no mesmo estilo, formato e nível de dificuldade dessa prova. Não copie questões reais de provas anteriores; crie questões parecidas.
- Varie os assuntos e a dificuldade (fácil, média e difícil).
- Só uma alternativa correta, com "correta" sendo o índice dela. Varie a posição da resposta certa.
- Todas as contas e fatos precisam estar CORRETOS. Confira cada questão antes de responder.
- Se precisar de figura, descreva-a em palavras no enunciado.
- A explicação deve mostrar o raciocínio passo a passo em 1 a 4 frases.
- Em "resumo", dê de 4 a 6 dicas práticas para ir bem nessa prova.

Responda SOMENTE com JSON neste formato:
{"titulo":"título curto do banco de questões","materia":"disciplina principal","resumo":["dica"],"flashcards":[],"quiz":[{"pergunta":"","opcoes":["","","","",""],"correta":0,"explicacao":""}]}`;
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
  if (!chave) return resposta(500, { erro: "A chave GEMINI_API_KEY não foi configurada na Vercel." });

  let dados = req.body;
  if (typeof dados === "string") { try { dados = JSON.parse(dados); } catch { return resposta(400, { erro: "Pedido inválido." }); } }

  const { modo, fotos, hoje, materia, assunto } = dados || {};
  if (!["agenda", "estudo", "horario", "mapa", "banco"].includes(modo)) return resposta(400, { erro: "Modo inválido." });

  if (modo === "banco") {
    const prova = String(dados.prova || "");
    if (!PROVAS[prova]) return resposta(400, { erro: "Escolha a prova ou olimpíada." });
    const quantidade = Math.min(15, Math.max(5, parseInt(dados.quantidade, 10) || 10));
    const texto = promptBanco({
      prova, quantidade,
      area: String(dados.area || "").slice(0, 60),
      serie: String(dados.serie || "").slice(0, 40),
      assunto: String(dados.assunto || "").slice(0, 120),
    });
    return responderComIA(chave, [{ text: texto }]);
  }

  if (modo === "mapa") {
    const texto = String(dados.texto || "").slice(0, 8000).trim();
    if (!texto) return resposta(400, { erro: "Envie o resumo para montar o mapa." });
    return responderComIA(chave, [{ text: promptMapa({ titulo: String(dados.titulo || "").slice(0, 100), texto }) }]);
  }

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

  return responderComIA(chave, partes);
};

async function responderComIA(chave, partes) {
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
}

module.exports.config = { maxDuration: 60 };

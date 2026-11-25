// Estudaí — grava linhas no Supabase (igual ao ResumAI), sem precisar instalar nada.
// Variáveis de ambiente na Vercel:
//   SUPABASE_URL               -> Project Settings → API → Project URL
//   SUPABASE_SERVICE_ROLE_KEY  -> Project Settings → API → service_role (secreta, só aqui no servidor)
// Sem essas variáveis, nada é gravado e o app continua funcionando normalmente.

function configurado() {
  return Boolean((process.env.SUPABASE_URL || "").trim() && (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim());
}

async function inserir(tabela, linha) {
  if (!configurado()) return { ok: false, motivo: "sem_supabase" };
  const base = process.env.SUPABASE_URL.trim().replace(/\/+$/, "");
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY.trim();
  try {
    const r = await fetch(`${base}/rest/v1/${tabela}`, {
      method: "POST",
      headers: {
        apikey: chave,
        authorization: `Bearer ${chave}`,
        "content-type": "application/json",
        prefer: "return=minimal",
      },
      body: JSON.stringify(linha),
    });
    if (!r.ok) {
      const detalhe = await r.text().catch(() => "");
      console.log("SUPABASE_ERRO", tabela, r.status, detalhe.slice(0, 300));
      return { ok: false, motivo: `erro ${r.status}` };
    }
    return { ok: true };
  } catch (e) {
    console.log("SUPABASE_FALHOU", tabela, e && e.message);
    return { ok: false, motivo: "conexao" };
  }
}

module.exports = { inserir, configurado };

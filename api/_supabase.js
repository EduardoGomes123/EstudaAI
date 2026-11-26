// Estudaí — grava linhas no Supabase (igual ao ResumAI), sem precisar instalar nada.
// Variáveis de ambiente na Vercel:
//   SUPABASE_URL               -> Project Settings → API → Project URL
//   SUPABASE_SERVICE_ROLE_KEY  -> Project Settings → API → service_role (secreta, só aqui no servidor)
// Sem essas variáveis, o app usa o projeto "EstudAÍ" abaixo com a chave pública:
// ela só tem permissão para ADICIONAR linhas nas tabelas estudai_feedback e estudai_uso
// (ninguém de fora consegue ler, mudar ou apagar). Você vê tudo no painel do Supabase.

const URL_PADRAO = "https://loctvfuyenyahhcfmmhm.supabase.co";
const CHAVE_PUBLICA = "sb_publishable_xEGNKeEvBe2dpDWUhT5Hww_lG33NAQt";

function base() { return ((process.env.SUPABASE_URL || "").trim() || URL_PADRAO).replace(/\/+$/, ""); }
function chave() { return (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim() || CHAVE_PUBLICA; }
function configurado() { return Boolean(base() && chave()); }

async function inserir(tabela, linha) {
  if (!configurado()) return { ok: false, motivo: "sem_supabase" };
  try {
    const r = await fetch(`${base()}/rest/v1/${tabela}`, {
      method: "POST",
      headers: {
        apikey: chave(),
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

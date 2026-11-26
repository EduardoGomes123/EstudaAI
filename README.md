# Estudaí: protótipo

O app para estudantes de 13 a 17 anos tem duas funções:

1. **Agenda por foto.** O aluno fotografa o quadro, a agenda ou um bilhete. A IA encontra as provas, trabalhos e deveres com as datas, e o aluno confere antes de salvar. O botão ⏰ Lembrete gera um arquivo de calendário que avisa 3 dias antes e na véspera da atividade.
2. **Estudar pelo caderno.** O aluno fotografa até 6 páginas. A IA cria um resumo, um **mapa mental em imagem estilo infográfico** (ícones em cada ideia, fotos reais da Wikipédia quando o assunto é concreto, números-chave em destaque e um macete para memorizar; dá para baixar ou mandar pelo WhatsApp), flashcards (com a opção "repetir só os que errei") e um simulado de múltipla escolha com nota. O material pode ficar ligado à prova da agenda.
3. **ENEM.** Dois jeitos:
   - **Questões reais:** questões oficiais de 2009 a 2023, com ano, número, imagens e gabarito oficial, buscadas na base pública [enem.dev](https://enem.dev). A IA explica cada resposta. Dá para filtrar por área, ano e assunto.
   - **Parecidas (IA):** a IA cria questões novas a partir de questões reais e mostra em qual cada uma foi inspirada (ex.: "Parecida com: ENEM 2019 · Questão 137").
4. **Olimpíadas.** O aluno escolhe a olimpíada (OBMEP, OBM, Canguru, OBA, OBF, OBQ, OBB, OBR, OBL, ONHB, OLP, OBI), a série e o assunto. A IA cria um banco de questões inéditas no estilo da prova, com gabarito e explicação.
5. **Feedback.** O botão 💬 Opinar (no topo) e o "esse material ficou bom?" coletam a opinião dos alunos.

Esta primeira versão de teste não tem login nem pagamento. Os dados ficam salvos só no celular de quem usa, e as fotos não ficam guardadas em lugar nenhum.

## Arquivos

| Arquivo | Para que serve |
|---|---|
| `index.html` | O app inteiro (telas e lógica) |
| `api/ia.js` | Ponte segura com o Gemini (a chave fica escondida aqui) |
| `api/feedback.js` | Recebe as opiniões dos alunos e grava no Supabase |
| `api/uso.js` | Conta o uso do app (anônimo) e grava no Supabase |
| `api/_supabase.js`, `api/_moderacao.js` | Gravação no Supabase e filtro de palavrões/links/telefone |
| `supabase/estudai.sql` | Tabelas e painéis para colar no Supabase |
| `api/_enem.js` | Busca as questões oficiais do ENEM (base pública enem.dev) |
| `vercel.json` | Configuração da Vercel |
| `manifest.json`, `sw.js`, `icon*.png`, `icon.svg` | Permitem instalar o app na tela inicial do celular |

## Como publicar na Vercel (dá para fazer pelo celular)

1. **GitHub:** crie um repositório novo (por exemplo, `estudai`) e envie todos os arquivos **mantendo a pasta `api/`**. Pelo celular, use "Add file → Upload files", ou crie cada arquivo pelo "Create new file" digitando o caminho com a barra (`api/ia.js`).
2. **Vercel:** vá em *Add New → Project*, importe o repositório e deixe *Framework Preset* como **Other**. Não há comando de build.
3. **Chave do Gemini:** antes de clicar em *Deploy*, abra *Environment Variables* e crie:
   - `GEMINI_API_KEY`: pode ser a mesma chave grátis do ResumAI (aistudio.google.com).
   - Não precisa de `GEMINI_MODEL`: o app já usa o `gemini-flash-latest`, o mesmo do ResumAI.
4. Se você criar ou mudar as variáveis depois, vá em *Deployments → ⋯ → Redeploy* para elas valerem.
5. Abra o site (`seu-projeto.vercel.app`) no celular e use **"Adicionar à tela inicial"**.

Antes de configurar a chave, o app abre em **modo prévia**: ao tirar uma foto, ele mostra um exemplo pronto.

Observação: na Vercel, cada pedido à IA pode ter no máximo 4,5 MB. O app já reduz as fotos antes de enviar, e 6 páginas cabem com folga.

## Onde ver os feedbacks e quem está usando (Supabase, igual ao ResumAI)

O app grava tudo no Supabase, em quatro painéis prontos:

| Painel (Table Editor) | O que mostra |
|---|---|
| `estudai_numeros` | Total de pessoas, quantas voltaram outro dia, ativas e novas nos últimos 7 dias, nº de feedbacks e nota média |
| `estudai_uso_por_dia` | Por dia: pessoas diferentes, aberturas, fotos da agenda, cronogramas, materiais do caderno, mapas, simulados feitos, ENEM/olimpíadas |
| `estudai_uso_funcoes` | Ranking das funções mais usadas nos últimos 30 dias |
| `estudai_feedback_resumo` | Opiniões por assunto: total, nota média, quem gostou/não gostou e comentários novos |

A tabela `estudai_feedback` tem cada opinião completa (carinha, assunto, texto, nome/série). Use a coluna `status` (novo, em_analise, resolvido, ignorado) e `observacao` para organizar. A tabela `estudai_uso` tem cada evento.

**Privacidade (ECA Digital):** o uso é anônimo. Cada aparelho recebe um código aleatório, e não guardamos nome, e-mail, fotos nem textos do caderno. Os comentários com palavrão, link, telefone ou e-mail são recusados.

### Já está ligado

O app grava no projeto **EstudAÍ** do Supabase usando a chave pública, que só tem permissão para **adicionar** linhas nessas duas tabelas (ninguém de fora lê, muda ou apaga). Não precisa configurar nada na Vercel.

Se um dia quiser trocar de projeto, crie na Vercel as variáveis `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`, rode `supabase/estudai.sql` no projeto novo e faça um Redeploy.

Para testar: abra o site, use alguma função e mande uma opinião. Em seguida, confira `estudai_numeros` e `estudai_feedback` no Supabase. Se nada aparecer, procure `SUPABASE_ERRO` em **Vercel → Logs**.

Os feedbacks continuam aparecendo também em **Vercel → Logs** (busque por `FEEDBACK`). Se quiser receber no Discord ou numa planilha do Google, crie a variável `FEEDBACK_URL` com o webhook do Discord ou o URL de um Apps Script (opcional).

Se o aluno estiver sem internet, o feedback fica guardado no celular e é enviado depois.

## Conta, turma e avisos (Supabase)

Fica tudo no botão **⚙️** do topo do app.

- **Código de recuperação:** cada celular ganha um código (ex.: `HGHS-A5KY-D74E`), e o app faz backup automático da agenda, cronograma e materiais. Em outro celular, é só digitar o código para recuperar tudo. Não pede e-mail nem senha, o que é melhor para menores (ECA Digital).
- **Turma:** o professor ou representante toca em "Sou professor / representante" e cria a turma. Recebe um código de 6 letras para mandar no grupo, com link `.../?turma=CODIGO`. Quando ele fotografa o quadro, aparece "Enviar também para a turma", e os alunos que entraram recebem as atividades na agenda ao abrir o app. Se ele excluir uma atividade, ela sai da agenda da turma.
- **Avisos no celular:** no máximo 1 por dia, no horário que o aluno escolher, e só quando tem prova, trabalho ou apresentação amanhã ou em 3 dias, ou dever para amanhã. Opcional: lembrete de estudo nos outros dias. No iPhone, só funciona com o app adicionado à tela inicial (iOS 16.4 ou mais novo).
- **Primeiro uso:** tela de boas-vindas com "Tirar foto da agenda", "Tenho o código da turma" e "Já uso em outro celular". Depois que o aluno salva as primeiras atividades, o app pergunta se ele quer ligar os avisos.

Como funciona por trás:
- `supabase/estudai_v2.sql`: tabelas `estudai_contas`, `estudai_turmas`, `estudai_turma_tarefas`, `estudai_push` e as funções que o app chama. As tabelas não podem ser lidas de fora; o app só usa as funções.
- `supabase/functions/estudai-lembretes`: função que envia os avisos. Roda de hora em hora pelo `pg_cron` (`supabase/estudai_v2_cron.sql`).
- As chaves dos avisos ficam na tabela `estudai_config`, que só o servidor lê. Não precisa configurar nada na Vercel.
- Painel novo: `estudai_contas_resumo` (contas com backup, turmas, atividades de turma e avisos ligados).

## O que observar no teste com os adolescentes

- Eles conseguem salvar uma prova a partir da foto em menos de 30 segundos?
- As datas vieram certas? ("próxima quinta", "12/03"…)
- Eles voltam sozinhos para fazer o simulado antes da prova?
- Qual parte eles mais usam: a agenda ou o estudar?

## Próximos passos (versão completa)

Painel dos pais, plano pago via Asaas e área do professor com várias turmas. Lembre também das regras do ECA Digital (Lei 15.211/2025): nada de anúncios para menores, nada de mecânicas de uso compulsivo, e coletar o mínimo de dados.

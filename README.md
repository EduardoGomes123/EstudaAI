# Estudaí: protótipo

O app para estudantes de 13 a 17 anos tem duas funções:

1. **Agenda por foto.** O aluno fotografa o quadro, a agenda ou um bilhete. A IA encontra as provas, trabalhos e deveres com as datas, e o aluno confere antes de salvar. O botão ⏰ Lembrete gera um arquivo de calendário que avisa 3 dias antes e na véspera da atividade.
2. **Estudar pelo caderno.** O aluno fotografa até 6 páginas. A IA cria um resumo, flashcards (com a opção "repetir só os que errei") e um simulado de múltipla escolha com nota. O material pode ficar ligado à prova da agenda.

Esta primeira versão de teste não tem login nem pagamento. Os dados ficam salvos só no celular de quem usa, e as fotos não ficam guardadas em lugar nenhum.

## Arquivos

| Arquivo | Para que serve |
|---|---|
| `index.html` | O app inteiro (telas e lógica) |
| `api/ia.js` | Ponte segura com o Gemini (a chave fica escondida aqui) |
| `vercel.json` | Configuração da Vercel |
| `manifest.json`, `sw.js`, `icon*.png`, `icon.svg` | Permitem instalar o app na tela inicial do celular |

## Como publicar na Vercel (dá para fazer pelo celular)

1. **GitHub:** crie um repositório novo (por exemplo, `estudai`) e envie todos os arquivos **mantendo a pasta `api/`**. Pelo celular, use "Add file → Upload files", ou crie cada arquivo pelo "Create new file" digitando o caminho com a barra (`api/ia.js`).
2. **Vercel:** vá em *Add New → Project*, importe o repositório e deixe *Framework Preset* como **Other**. Não há comando de build.
3. **Chave do Gemini:** antes de clicar em *Deploy*, abra *Environment Variables* e crie:
   - `GEMINI_API_KEY`: pode ser a mesma chave grátis do ResumAI (aistudio.google.com).
   - `GEMINI_MODEL` (opcional): coloque o mesmo modelo que está funcionando no ResumAI. Se ficar vazio, o app tenta sozinho uma lista de modelos Flash.
4. Se você criar ou mudar as variáveis depois, vá em *Deployments → ⋯ → Redeploy* para elas valerem.
5. Abra o site (`seu-projeto.vercel.app`) no celular e use **"Adicionar à tela inicial"**.

Antes de configurar a chave, o app abre em **modo prévia**: ao tirar uma foto, ele mostra um exemplo pronto.

Observação: na Vercel, cada pedido à IA pode ter no máximo 4,5 MB. O app já reduz as fotos antes de enviar, e 6 páginas cabem com folga.

## O que observar no teste com os adolescentes

- Eles conseguem salvar uma prova a partir da foto em menos de 30 segundos?
- As datas vieram certas? ("próxima quinta", "12/03"…)
- Eles voltam sozinhos para fazer o simulado antes da prova?
- Qual parte eles mais usam: a agenda ou o estudar?

## Próximos passos (versão completa)

Login com Google, sincronização no Supabase, notificações de verdade (push), painel dos pais e plano pago via Asaas. Lembre também das regras do ECA Digital (Lei 15.211/2025): nada de anúncios para menores, nada de mecânicas de uso compulsivo, e coletar o mínimo de dados.

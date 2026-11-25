-- Estudaí — tabelas de feedback e de uso
-- Cole tudo no Supabase (SQL Editor → New query → Run). Pode rodar de novo sem problema.
-- Pode ser o mesmo projeto do ResumAI: as tabelas têm o prefixo "estudai_" e não se misturam.

-- 1) Opiniões dos alunos (botão 💬 Opinar e "esse material ficou bom?")
create table if not exists public.estudai_feedback (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  nota smallint check (nota between 1 and 5),            -- 1 = 😡 … 5 = 😍
  area text not null default 'geral',                     -- agenda, resumo, simulado, ideia, problema…
  texto text check (char_length(texto) <= 2000),
  nome text check (char_length(nome) <= 60),              -- primeiro nome ou série (opcional)
  contexto text,                                          -- ex.: "Material: Revolução Francesa"
  aparelho text,                                          -- celular/navegador
  visitante text,                                         -- código anônimo do aparelho
  status text not null default 'novo' check (status in ('novo','em_analise','resolvido','ignorado')),
  observacao text                                         -- anotação sua
);
alter table public.estudai_feedback enable row level security;
-- sem políticas: só o servidor do app grava e só você vê pelo painel do Supabase
create index if not exists estudai_feedback_data on public.estudai_feedback (created_at desc);

-- 2) Uso do app (cada vez que alguém abre o app ou usa uma função)
-- Não guarda nome, e-mail, fotos nem textos: só o código anônimo do aparelho e o que foi usado.
create table if not exists public.estudai_uso (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  visitante text not null,                                -- código anônimo do aparelho
  evento text not null,                                   -- abriu, agenda, estudo, mapa, simulado_fim…
  detalhe text,                                           -- ex.: nota do simulado, área do ENEM
  aparelho text
);
alter table public.estudai_uso enable row level security;
create index if not exists estudai_uso_data on public.estudai_uso (created_at desc);
create index if not exists estudai_uso_evento on public.estudai_uso (evento, created_at desc);

-- ===== PAINÉIS (abra em Table Editor; aparecem como "views") =====

-- Opiniões por assunto: quantas, nota média e comentários novos
create or replace view public.estudai_feedback_resumo with (security_invoker = true) as
select
  area,
  count(*)                                                        as total,
  round(avg(nota), 1)                                             as nota_media,
  count(*) filter (where nota >= 4)                               as gostaram,
  count(*) filter (where nota <= 2)                               as nao_gostaram,
  count(*) filter (where status = 'novo' and coalesce(texto,'') <> '') as comentarios_novos
from public.estudai_feedback
group by area
order by total desc;

-- Uso por dia: pessoas diferentes e quantas vezes cada função foi usada
create or replace view public.estudai_uso_por_dia with (security_invoker = true) as
select
  (created_at at time zone 'America/Recife')::date               as dia,
  count(distinct visitante)                                       as pessoas,
  count(*) filter (where evento = 'abriu')                        as aberturas,
  count(*) filter (where evento = 'agenda')                       as fotos_agenda,
  count(*) filter (where evento = 'horario')                      as cronogramas,
  count(*) filter (where evento = 'estudo')                       as materiais_caderno,
  count(*) filter (where evento = 'mapa')                         as mapas,
  count(*) filter (where evento = 'simulado_fim')                 as simulados_feitos,
  count(*) filter (where evento in ('enem','banco'))              as enem_olimpiadas
from public.estudai_uso
group by 1
order by 1 desc;

-- Ranking das funções: o que a turma mais usa (últimos 30 dias)
create or replace view public.estudai_uso_funcoes with (security_invoker = true) as
select
  evento,
  count(*)                                                        as vezes,
  count(distinct visitante)                                       as pessoas
from public.estudai_uso
where created_at > now() - interval '30 days'
group by evento
order by vezes desc;

-- Números gerais: total de pessoas, quem voltou e quem usou nos últimos 7 dias
create or replace view public.estudai_numeros with (security_invoker = true) as
with por_pessoa as (
  select visitante,
         min(created_at) as primeira_vez,
         max(created_at) as ultima_vez,
         count(distinct (created_at at time zone 'America/Recife')::date) as dias_de_uso
  from public.estudai_uso
  group by visitante
)
select
  count(*)                                                        as pessoas_total,
  count(*) filter (where dias_de_uso >= 2)                        as voltaram_outro_dia,
  count(*) filter (where ultima_vez > now() - interval '7 days')  as ativas_7_dias,
  count(*) filter (where primeira_vez > now() - interval '7 days') as novas_7_dias,
  (select count(*) from public.estudai_feedback)                  as feedbacks,
  (select round(avg(nota), 1) from public.estudai_feedback)       as nota_media
from por_pessoa;

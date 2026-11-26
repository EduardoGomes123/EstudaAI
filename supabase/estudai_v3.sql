-- Estudaí v3 — material da turma, presença e resultados anônimos para o professor, e uso do Tira-dúvida.

-- Material (resumo, flashcards, simulado, mapa) que o professor manda para a turma
create table if not exists public.estudai_turma_materiais (
  id uuid primary key default gen_random_uuid(),
  turma_id uuid not null references public.estudai_turmas(id) on delete cascade,
  tarefa_origem uuid references public.estudai_turma_tarefas(id) on delete set null,
  titulo text not null,
  materia text,
  conteudo jsonb not null,
  criado timestamptz not null default now(),
  removido boolean not null default false
);
alter table public.estudai_turma_materiais enable row level security;
revoke all on public.estudai_turma_materiais from anon, authenticated;
create index if not exists estudai_turma_materiais_turma on public.estudai_turma_materiais (turma_id, criado desc);

-- Quem está na turma (código anônimo; serve só para contar)
create table if not exists public.estudai_turma_membros (
  turma_id uuid not null references public.estudai_turmas(id) on delete cascade,
  aluno_hash text not null,
  entrou timestamptz not null default now(),
  ultimo_acesso timestamptz not null default now(),
  primary key (turma_id, aluno_hash)
);
alter table public.estudai_turma_membros enable row level security;
revoke all on public.estudai_turma_membros from anon, authenticated;

-- Resultado do simulado da turma (anônimo): primeira tentativa e melhor nota
create table if not exists public.estudai_turma_resultados (
  material_id uuid not null references public.estudai_turma_materiais(id) on delete cascade,
  aluno_hash text not null,
  nota_primeira smallint not null,
  acertos_primeira jsonb not null,
  melhor_nota smallint not null,
  tentativas smallint not null default 1,
  feito timestamptz not null default now(),
  primary key (material_id, aluno_hash)
);
alter table public.estudai_turma_resultados enable row level security;
revoke all on public.estudai_turma_resultados from anon, authenticated;

-- Ver turma agora também devolve os materiais
create or replace function public.estudai_turma_ver(p_codigo text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare t record;
begin
  select * into t from estudai_turmas where codigo = upper(regexp_replace(coalesce(p_codigo,''), '[^A-Za-z0-9]', '', 'g'));
  if not found then return null; end if;
  return jsonb_build_object(
    'codigo', t.codigo, 'nome', t.nome, 'escola', t.escola,
    'tarefas', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'tipo', x.tipo, 'materia', x.materia, 'titulo', x.titulo, 'data', x.data, 'detalhes', x.detalhes) order by x.data nulls last)
                         from estudai_turma_tarefas x where x.turma_id = t.id and not x.removida and (x.data is null or x.data >= current_date - 7)), '[]'::jsonb),
    'removidas', coalesce((select jsonb_agg(x.id) from estudai_turma_tarefas x where x.turma_id = t.id and x.removida and x.criado > now() - interval '60 days'), '[]'::jsonb),
    'materiais', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'titulo', m.titulo, 'materia', m.materia, 'tarefa_origem', m.tarefa_origem, 'conteudo', m.conteudo) order by m.criado)
                         from estudai_turma_materiais m where m.turma_id = t.id and not m.removido and m.criado > now() - interval '45 days'), '[]'::jsonb),
    'materiais_removidos', coalesce((select jsonb_agg(m.id) from estudai_turma_materiais m where m.turma_id = t.id and m.removido and m.criado > now() - interval '60 days'), '[]'::jsonb)
  );
end $$;

-- Professor manda um material para a turma
create or replace function public.estudai_turma_publicar_material(p_codigo text, p_segredo text, p_material jsonb, p_tarefa_origem uuid) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare t record; novo uuid;
begin
  select * into t from estudai_turmas where codigo = upper(regexp_replace(coalesce(p_codigo,''), '[^A-Za-z0-9]', '', 'g'));
  if not found or t.segredo_hash <> estudai_hash(p_segredo) then raise exception 'sem permissao para publicar nesta turma'; end if;
  if jsonb_typeof(p_material) <> 'object' or octet_length(p_material::text) > 200000 then raise exception 'material invalido ou grande demais'; end if;
  insert into estudai_turma_materiais (turma_id, tarefa_origem, titulo, materia, conteudo)
  values (t.id,
    (select x.id from estudai_turma_tarefas x where x.id = p_tarefa_origem and x.turma_id = t.id),
    left(coalesce(nullif(p_material->>'titulo',''), 'Material de estudo'), 80),
    left(nullif(p_material->>'materia',''), 40),
    jsonb_build_object('resumo', coalesce(p_material->'resumo','[]'), 'flashcards', coalesce(p_material->'flashcards','[]'),
                       'quiz', coalesce(p_material->'quiz','[]'), 'mapa', p_material->'mapa', 'banco', p_material->'banco'))
  returning id into novo;
  return novo;
end $$;

create or replace function public.estudai_turma_remover_material(p_codigo text, p_segredo text, p_id uuid) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare t record;
begin
  select * into t from estudai_turmas where codigo = upper(regexp_replace(coalesce(p_codigo,''), '[^A-Za-z0-9]', '', 'g'));
  if not found or t.segredo_hash <> estudai_hash(p_segredo) then raise exception 'sem permissao'; end if;
  update estudai_turma_materiais set removido = true where id = p_id and turma_id = t.id;
  return found;
end $$;

-- Aluno avisa que está na turma (para o professor saber quantos entraram)
create or replace function public.estudai_turma_presenca(p_codigo text, p_aluno text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare t record;
begin
  select * into t from estudai_turmas where codigo = upper(regexp_replace(coalesce(p_codigo,''), '[^A-Za-z0-9]', '', 'g'));
  if not found or char_length(regexp_replace(coalesce(p_aluno,''), '[^A-Za-z0-9]', '', 'g')) < 12 then return false; end if;
  insert into estudai_turma_membros (turma_id, aluno_hash) values (t.id, estudai_hash(p_aluno || t.codigo))
  on conflict (turma_id, aluno_hash) do update set ultimo_acesso = now();
  return true;
end $$;

-- Aluno manda o resultado do simulado da turma (sem nome)
create or replace function public.estudai_turma_resultado(p_codigo text, p_aluno text, p_material uuid, p_nota int, p_acertos jsonb) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare t record; h text; nota smallint := greatest(0, least(100, coalesce(p_nota, 0)));
begin
  select * into t from estudai_turmas where codigo = upper(regexp_replace(coalesce(p_codigo,''), '[^A-Za-z0-9]', '', 'g'));
  if not found or char_length(regexp_replace(coalesce(p_aluno,''), '[^A-Za-z0-9]', '', 'g')) < 12 then return false; end if;
  if not exists (select 1 from estudai_turma_materiais m where m.id = p_material and m.turma_id = t.id) then return false; end if;
  if jsonb_typeof(p_acertos) <> 'array' or jsonb_array_length(p_acertos) > 40 then return false; end if;
  h := estudai_hash(p_aluno || t.codigo);
  insert into estudai_turma_resultados (material_id, aluno_hash, nota_primeira, acertos_primeira, melhor_nota)
  values (p_material, h, nota, p_acertos, nota)
  on conflict (material_id, aluno_hash) do update
    set melhor_nota = greatest(estudai_turma_resultados.melhor_nota, excluded.melhor_nota),
        tentativas = least(estudai_turma_resultados.tentativas + 1, 999);
  insert into estudai_turma_membros (turma_id, aluno_hash) values (t.id, h)
  on conflict (turma_id, aluno_hash) do update set ultimo_acesso = now();
  return true;
end $$;

-- Painel do professor: só números da turma, nunca quem é quem.
-- Detalhes por questão só aparecem com 3 ou mais alunos (para ninguém ser identificado).
create or replace function public.estudai_turma_painel(p_codigo text, p_segredo text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare t record;
begin
  select * into t from estudai_turmas where codigo = upper(regexp_replace(coalesce(p_codigo,''), '[^A-Za-z0-9]', '', 'g'));
  if not found or t.segredo_hash <> estudai_hash(p_segredo) then raise exception 'sem permissao'; end if;
  return jsonb_build_object(
    'nome', t.nome, 'codigo', t.codigo,
    'membros', (select count(*) from estudai_turma_membros where turma_id = t.id),
    'ativos_7d', (select count(*) from estudai_turma_membros where turma_id = t.id and ultimo_acesso > now() - interval '7 days'),
    'atividades', (select count(*) from estudai_turma_tarefas where turma_id = t.id and not removida and (data is null or data >= current_date)),
    'materiais', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'titulo', m.titulo, 'materia', m.materia, 'criado', m.criado,
        'feitos', (select count(*) from estudai_turma_resultados r where r.material_id = m.id),
        'media_primeira', (select round(avg(r.nota_primeira)) from estudai_turma_resultados r where r.material_id = m.id having count(*) >= 3),
        'media_melhor', (select round(avg(r.melhor_nota)) from estudai_turma_resultados r where r.material_id = m.id having count(*) >= 3),
        'questoes', case when (select count(*) from estudai_turma_resultados r where r.material_id = m.id) >= 3 then (
          select jsonb_agg(jsonb_build_object(
            'pergunta', left(q.value->>'pergunta', 140),
            'acerto', (select round(100.0 * count(*) filter (where (r.acertos_primeira->>(q.ordinality::int - 1))::boolean) / nullif(count(*) filter (where r.acertos_primeira->>(q.ordinality::int - 1) is not null), 0))
                       from estudai_turma_resultados r where r.material_id = m.id)
          ) order by q.ordinality)
          from jsonb_array_elements(m.conteudo->'quiz') with ordinality q) end
      ) order by m.criado desc)
      from estudai_turma_materiais m where m.turma_id = t.id and not m.removido), '[]'::jsonb)
  );
end $$;

revoke all on function public.estudai_turma_publicar_material(text, text, jsonb, uuid), public.estudai_turma_remover_material(text, text, uuid),
  public.estudai_turma_presenca(text, text), public.estudai_turma_resultado(text, text, uuid, int, jsonb), public.estudai_turma_painel(text, text) from public;
grant execute on function public.estudai_turma_publicar_material(text, text, jsonb, uuid), public.estudai_turma_remover_material(text, text, uuid),
  public.estudai_turma_presenca(text, text), public.estudai_turma_resultado(text, text, uuid, int, jsonb), public.estudai_turma_painel(text, text) to anon, authenticated;
grant execute on function public.estudai_turma_ver(text) to service_role;

-- Uso: novo evento "duvida" (Tira-dúvida)
create policy "app grava uso v3" on public.estudai_uso for insert to anon
  with check (evento in ('duvida') and char_length(visitante) between 8 and 40 and char_length(coalesce(detalhe,'')) <= 80 and char_length(coalesce(aparelho,'')) <= 160);

create or replace view public.estudai_uso_por_dia with (security_invoker = true) as
select (created_at at time zone 'America/Recife')::date as dia,
  count(distinct visitante) as pessoas,
  count(*) filter (where evento = 'abriu') as aberturas,
  count(*) filter (where evento = 'agenda') as fotos_agenda,
  count(*) filter (where evento = 'horario') as cronogramas,
  count(*) filter (where evento = 'estudo') as materiais_caderno,
  count(*) filter (where evento = 'mapa') as mapas,
  count(*) filter (where evento = 'simulado_fim') as simulados_feitos,
  count(*) filter (where evento in ('enem','banco')) as enem_olimpiadas,
  count(*) filter (where evento = 'duvida') as duvidas
from public.estudai_uso group by 1 order by 1 desc;
revoke all on public.estudai_uso_por_dia from anon, authenticated;

create or replace view public.estudai_contas_resumo with (security_invoker = true) as
select
  (select count(*) from public.estudai_contas) as contas_com_backup,
  (select count(*) from public.estudai_contas where atualizado > now() - interval '7 days') as backups_7_dias,
  (select count(*) from public.estudai_turmas) as turmas,
  (select count(*) from public.estudai_turma_tarefas where not removida) as atividades_de_turma,
  (select count(*) from public.estudai_push where ativo) as avisos_ligados,
  (select count(*) from public.estudai_turma_membros) as alunos_em_turmas,
  (select count(*) from public.estudai_turma_materiais where not removido) as materiais_de_turma;
revoke all on public.estudai_contas_resumo from anon, authenticated;

-- v4: eventos de uso da redação e do modo foco
create policy "app grava uso v4" on public.estudai_uso for insert to anon
  with check (evento in ('redacao','foco') and char_length(visitante) between 8 and 40 and char_length(coalesce(detalhe,'')) <= 80 and char_length(coalesce(aparelho,'')) <= 160);
-- (a view estudai_uso_por_dia ganhou as colunas redacoes e sessoes_foco)

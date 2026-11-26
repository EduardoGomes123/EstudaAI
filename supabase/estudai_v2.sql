-- Estudaí v2 — backup com código de recuperação, turmas e avisos no celular.
-- O app nunca acessa estas tabelas direto: só pelas funções abaixo (security definer).

create extension if not exists pgcrypto with schema extensions;

-- Configuração interna (chaves dos avisos). Só o servidor lê.
create table if not exists public.estudai_config (chave text primary key, valor text not null);
alter table public.estudai_config enable row level security;
revoke all on public.estudai_config from anon, authenticated;

-- 1) Contas: um código de recuperação por aluno (sem e-mail, sem senha)
create table if not exists public.estudai_contas (
  id uuid primary key default gen_random_uuid(),
  codigo_hash text unique not null,
  dados jsonb,
  criado timestamptz not null default now(),
  atualizado timestamptz not null default now()
);
alter table public.estudai_contas enable row level security;
revoke all on public.estudai_contas from anon, authenticated;

-- 2) Turmas: o professor/representante publica, os alunos recebem
create table if not exists public.estudai_turmas (
  id uuid primary key default gen_random_uuid(),
  codigo text unique not null,
  nome text not null check (char_length(nome) between 1 and 60),
  escola text check (char_length(escola) <= 80),
  segredo_hash text not null,
  criado timestamptz not null default now()
);
alter table public.estudai_turmas enable row level security;
revoke all on public.estudai_turmas from anon, authenticated;

create table if not exists public.estudai_turma_tarefas (
  id uuid primary key default gen_random_uuid(),
  turma_id uuid not null references public.estudai_turmas(id) on delete cascade,
  tipo text not null default 'outro',
  materia text,
  titulo text not null,
  data date,
  detalhes text,
  criado timestamptz not null default now(),
  removida boolean not null default false
);
alter table public.estudai_turma_tarefas enable row level security;
revoke all on public.estudai_turma_tarefas from anon, authenticated;
create index if not exists estudai_turma_tarefas_turma on public.estudai_turma_tarefas (turma_id, criado desc);

-- 3) Avisos no celular (Web Push)
create table if not exists public.estudai_push (
  endpoint text primary key,
  p256dh text not null,
  auth text not null,
  conta_id uuid references public.estudai_contas(id) on delete cascade,
  hora smallint not null default 19 check (hora between 6 and 21),
  diario boolean not null default false,
  ativo boolean not null default true,
  ultimo_envio date,
  criado timestamptz not null default now()
);
alter table public.estudai_push enable row level security;
revoke all on public.estudai_push from anon, authenticated;
create index if not exists estudai_push_hora on public.estudai_push (hora) where ativo;

-- ===== funções usadas pelo app =====

create or replace function public.estudai_hash(t text) returns text
language sql immutable set search_path = public, extensions as
$$ select encode(extensions.digest(upper(regexp_replace(coalesce(t,''), '[^A-Za-z0-9]', '', 'g')), 'sha256'), 'hex') $$;

create or replace function public.estudai_codigo(n int) returns text
language plpgsql volatile set search_path = public, extensions as $$
declare
  alfabeto text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  b bytea := extensions.gen_random_bytes(n);
  r text := '';
begin
  for i in 0..n-1 loop r := r || substr(alfabeto, (get_byte(b, i) % 31) + 1, 1); end loop;
  return r;
end $$;

-- Backup: grava os dados do aparelho
create or replace function public.estudai_salvar(p_codigo text, p_dados jsonb) returns timestamptz
language plpgsql security definer set search_path = public, extensions as $$
declare h text; agora timestamptz := now();
begin
  if char_length(regexp_replace(coalesce(p_codigo,''), '[^A-Za-z0-9]', '', 'g')) < 12 then raise exception 'codigo invalido'; end if;
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' then raise exception 'dados invalidos'; end if;
  if octet_length(p_dados::text) > 3000000 then raise exception 'dados grandes demais'; end if;
  h := estudai_hash(p_codigo);
  insert into estudai_contas (codigo_hash, dados, atualizado) values (h, p_dados, agora)
  on conflict (codigo_hash) do update set dados = excluded.dados, atualizado = agora;
  return agora;
end $$;

-- Backup: devolve os dados para usar em outro celular
create or replace function public.estudai_restaurar(p_codigo text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare r record;
begin
  perform pg_sleep(0.3); -- atrapalha quem tenta adivinhar códigos
  select dados, atualizado into r from estudai_contas where codigo_hash = estudai_hash(p_codigo);
  if not found then return null; end if;
  return jsonb_build_object('dados', r.dados, 'atualizado', r.atualizado);
end $$;

-- Turma: criar (devolve o código para os alunos e o segredo de quem publica)
create or replace function public.estudai_turma_criar(p_nome text, p_escola text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare c text; s text;
begin
  if char_length(trim(coalesce(p_nome,''))) = 0 then raise exception 'nome da turma vazio'; end if;
  loop
    c := estudai_codigo(6);
    exit when not exists (select 1 from estudai_turmas where codigo = c);
  end loop;
  s := estudai_codigo(16);
  insert into estudai_turmas (codigo, nome, escola, segredo_hash)
  values (c, left(trim(p_nome), 60), nullif(left(trim(coalesce(p_escola,'')), 80), ''), estudai_hash(s));
  return jsonb_build_object('codigo', c, 'segredo', s, 'nome', left(trim(p_nome), 60));
end $$;

-- Turma: ver nome e atividades (alunos)
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
    'removidas', coalesce((select jsonb_agg(x.id) from estudai_turma_tarefas x where x.turma_id = t.id and x.removida and x.criado > now() - interval '60 days'), '[]'::jsonb)
  );
end $$;

-- Turma: publicar atividades (precisa do segredo de quem criou)
create or replace function public.estudai_turma_publicar(p_codigo text, p_segredo text, p_tarefas jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare t record; x jsonb; ids jsonb := '[]'::jsonb; novo uuid;
begin
  select * into t from estudai_turmas where codigo = upper(regexp_replace(coalesce(p_codigo,''), '[^A-Za-z0-9]', '', 'g'));
  if not found or t.segredo_hash <> estudai_hash(p_segredo) then raise exception 'sem permissao para publicar nesta turma'; end if;
  if jsonb_typeof(p_tarefas) <> 'array' or jsonb_array_length(p_tarefas) > 30 then raise exception 'lista invalida'; end if;
  for x in select * from jsonb_array_elements(p_tarefas) loop
    insert into estudai_turma_tarefas (turma_id, tipo, materia, titulo, data, detalhes)
    values (t.id,
      case when x->>'tipo' in ('prova','trabalho','dever','apresentacao','outro') then x->>'tipo' else 'outro' end,
      left(nullif(x->>'materia',''), 40),
      left(coalesce(nullif(x->>'titulo',''), 'Atividade'), 120),
      case when (x->>'data') ~ '^\d{4}-\d{2}-\d{2}$' then (x->>'data')::date end,
      left(nullif(x->>'detalhes',''), 400))
    returning id into novo;
    ids := ids || to_jsonb(novo);
  end loop;
  return ids;
end $$;

-- Turma: tirar uma atividade (precisa do segredo)
create or replace function public.estudai_turma_remover(p_codigo text, p_segredo text, p_id uuid) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare t record;
begin
  select * into t from estudai_turmas where codigo = upper(regexp_replace(coalesce(p_codigo,''), '[^A-Za-z0-9]', '', 'g'));
  if not found or t.segredo_hash <> estudai_hash(p_segredo) then raise exception 'sem permissao'; end if;
  update estudai_turma_tarefas set removida = true where id = p_id and turma_id = t.id;
  return found;
end $$;

-- Avisos: ligar, mudar horário ou desligar
create or replace function public.estudai_push_salvar(p_codigo text, p_sub jsonb, p_hora int, p_diario boolean, p_ativo boolean) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare c uuid; ep text := p_sub->>'endpoint';
begin
  if ep is null or ep !~ '^https://' or char_length(ep) > 1000 then raise exception 'inscricao invalida'; end if;
  select id into c from estudai_contas where codigo_hash = estudai_hash(p_codigo);
  if c is null then raise exception 'faca o backup antes de ativar os avisos'; end if;
  insert into estudai_push (endpoint, p256dh, auth, conta_id, hora, diario, ativo)
  values (ep, p_sub->'keys'->>'p256dh', p_sub->'keys'->>'auth', c, greatest(6, least(21, coalesce(p_hora, 19))), coalesce(p_diario, false), coalesce(p_ativo, true))
  on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth, conta_id = excluded.conta_id,
    hora = excluded.hora, diario = excluded.diario, ativo = excluded.ativo;
  return true;
end $$;

revoke all on function public.estudai_hash(text), public.estudai_codigo(int) from public, anon, authenticated;
revoke all on function public.estudai_salvar(text, jsonb), public.estudai_restaurar(text), public.estudai_turma_criar(text, text),
  public.estudai_turma_ver(text), public.estudai_turma_publicar(text, text, jsonb), public.estudai_turma_remover(text, text, uuid),
  public.estudai_push_salvar(text, jsonb, int, boolean, boolean) from public;
grant execute on function public.estudai_salvar(text, jsonb), public.estudai_restaurar(text), public.estudai_turma_criar(text, text),
  public.estudai_turma_ver(text), public.estudai_turma_publicar(text, text, jsonb), public.estudai_turma_remover(text, text, uuid),
  public.estudai_push_salvar(text, jsonb, int, boolean, boolean) to anon, authenticated;

-- Painel: quantos alunos têm backup, turmas e avisos ligados
create or replace view public.estudai_contas_resumo with (security_invoker = true) as
select
  (select count(*) from public.estudai_contas)                                        as contas_com_backup,
  (select count(*) from public.estudai_contas where atualizado > now() - interval '7 days') as backups_7_dias,
  (select count(*) from public.estudai_turmas)                                        as turmas,
  (select count(*) from public.estudai_turma_tarefas where not removida)              as atividades_de_turma,
  (select count(*) from public.estudai_push where ativo)                              as avisos_ligados;
revoke all on public.estudai_contas_resumo from anon, authenticated;

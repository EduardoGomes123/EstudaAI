-- Estudaí v2 — agenda a função de avisos para rodar de hora em hora (minuto 2).
-- As chaves dos avisos (VAPID) e o segredo do cron ficam na tabela estudai_config (só o servidor lê).
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
grant execute on function public.estudai_turma_ver(text) to service_role;

create or replace function public.estudai_chamar_lembretes(p_hora int default null) returns bigint
language plpgsql security definer set search_path = public, extensions as $$
declare seg text;
begin
  select valor into seg from public.estudai_config where chave = 'cron_segredo';
  return net.http_post(
    url := 'https://loctvfuyenyahhcfmmhm.supabase.co/functions/v1/estudai-lembretes',
    headers := jsonb_build_object('content-type', 'application/json', 'x-cron', seg),
    body := case when p_hora is null then '{}'::jsonb else jsonb_build_object('hora', p_hora) end,
    timeout_milliseconds := 60000
  );
end $$;
revoke all on function public.estudai_chamar_lembretes(int) from public, anon, authenticated;

select cron.schedule('estudai-lembretes', '2 * * * *', $$ select public.estudai_chamar_lembretes() $$);

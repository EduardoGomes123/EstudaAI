-- EstudAÍ v5: novos eventos de uso (revisão do dia, quiz relâmpago, resumo da família, ouvir resumo)
create policy "app grava uso v5" on public.estudai_uso for insert to anon with check (
  evento = any (array['revisao','relampago','familia','ouvir']) and char_length(visitante) between 8 and 40
  and char_length(coalesce(detalhe,'')) <= 80 and char_length(coalesce(aparelho,'')) <= 160);

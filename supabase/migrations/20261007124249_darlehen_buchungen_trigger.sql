-- Nach jedem EBICS-Import neue Buchungen den Darlehen zuordnen; Fehler blockieren den Import nicht
create or replace function public.trg_bankbuchungen_darlehen() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    perform public.darlehen_buchungen_zuordnen();
  exception when others then
    raise warning 'darlehen_buchungen_zuordnen fehlgeschlagen: %', sqlerrm;
  end;
  return null;
end $$;
revoke execute on function public.trg_bankbuchungen_darlehen() from public, anon, authenticated;

drop trigger if exists bankbuchungen_darlehen_zuordnen on public.bankbuchungen;
create trigger bankbuchungen_darlehen_zuordnen after insert on public.bankbuchungen
for each statement execute function public.trg_bankbuchungen_darlehen();

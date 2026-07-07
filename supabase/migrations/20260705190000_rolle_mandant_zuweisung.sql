-- Mandantenzugriff je Rolle konfigurierbar (alle / mehrere / einzeln)

create type public.mandant_zuweisung as enum ('alle', 'mehrere', 'einzeln');

alter table public.rollen
  add column if not exists mandant_zuweisung public.mandant_zuweisung not null default 'alle';

update public.rollen
set mandant_zuweisung = 'einzeln'
where id = 'leser';

create or replace function public.update_rolle_mandant_zuweisung(
  p_rolle text,
  p_mandant_zuweisung public.mandant_zuweisung
)
returns public.rollen
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bearbeiter text;
  v_rolle public.rollen;
begin
  v_bearbeiter := public.jwt_rolle();

  if v_bearbeiter not in ('op_admin', 'administrator', 'manager') then
    raise exception 'Keine Berechtigung zum Bearbeiten von Rollen';
  end if;

  if v_bearbeiter <> 'op_admin'
     and public.rolle_rang(p_rolle) <= public.rolle_rang(v_bearbeiter) then
    raise exception 'Diese Rolle darf nicht bearbeitet werden';
  end if;

  update public.rollen
  set mandant_zuweisung = p_mandant_zuweisung
  where id = p_rolle
  returning * into v_rolle;

  if not found then
    raise exception 'Rolle nicht gefunden';
  end if;

  return v_rolle;
end;
$$;

revoke all on function public.update_rolle_mandant_zuweisung(text, public.mandant_zuweisung) from public;
grant execute on function public.update_rolle_mandant_zuweisung(text, public.mandant_zuweisung) to authenticated;

-- Cron/EBICS (service_role) darf Sollstellung abgleichen und Stammdaten pflegen.
create or replace function public.jwt_darf_schreiben()
returns boolean
language sql
stable
set search_path to 'public'
as $function$
  select
    coalesce(auth.role(), '') = 'service_role'
    or public.jwt_rolle() in ('op_admin', 'administrator', 'manager', 'mitarbeiter');
$function$;

grant execute on function public.gleiche_sollstellung_ab(uuid) to service_role;
grant execute on function public.erzeuge_sollstellung_lauf(text, text) to service_role;

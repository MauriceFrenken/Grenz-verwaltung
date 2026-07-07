-- Rollen-Berechtigungs-Matrix (global pro Rolle)
-- Anwenden via Supabase Dashboard SQL Editor oder: supabase db push

create table if not exists public.rolle_berechtigungen (
  rolle text not null check (rolle in ('administrator', 'manager', 'mitarbeiter', 'leser')),
  berechtigung_id text not null,
  aktiv boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  primary key (rolle, berechtigung_id)
);

create index if not exists rolle_berechtigungen_rolle_idx on public.rolle_berechtigungen (rolle);

alter table public.rolle_berechtigungen enable row level security;

-- Hilfsfunktion: Rolle aus JWT app_metadata
create or replace function public.jwt_rolle()
returns text
language sql
stable
as $$
  select coalesce(
    auth.jwt() -> 'app_metadata' ->> 'rolle',
    'leser'
  );
$$;

-- Hilfsfunktion: Rang (niedriger = höhere Stufe)
create or replace function public.rolle_rang(p_rolle text)
returns int
language sql
immutable
as $$
  select case p_rolle
    when 'op_admin' then 0
    when 'administrator' then 1
    when 'manager' then 2
    when 'mitarbeiter' then 3
    when 'leser' then 4
    else 99
  end;
$$;

-- Lesen: alle authentifizierten User (UI braucht Matrix für Checks)
create policy "rolle_berechtigungen_select_authenticated"
  on public.rolle_berechtigungen
  for select
  to authenticated
  using (true);

-- Schreiben: nur op_admin, administrator, manager — und nur niedrigere Rollen
create policy "rolle_berechtigungen_insert_hierarchy"
  on public.rolle_berechtigungen
  for insert
  to authenticated
  with check (
    public.jwt_rolle() in ('op_admin', 'administrator', 'manager')
    and public.rolle_rang(rolle) > public.rolle_rang(public.jwt_rolle())
  );

create policy "rolle_berechtigungen_update_hierarchy"
  on public.rolle_berechtigungen
  for update
  to authenticated
  using (
    public.jwt_rolle() in ('op_admin', 'administrator', 'manager')
    and public.rolle_rang(rolle) > public.rolle_rang(public.jwt_rolle())
  )
  with check (
    public.jwt_rolle() in ('op_admin', 'administrator', 'manager')
    and public.rolle_rang(rolle) > public.rolle_rang(public.jwt_rolle())
  );

create policy "rolle_berechtigungen_delete_hierarchy"
  on public.rolle_berechtigungen
  for delete
  to authenticated
  using (
    public.jwt_rolle() in ('op_admin', 'administrator', 'manager')
    and public.rolle_rang(rolle) > public.rolle_rang(public.jwt_rolle())
  );

-- Batch-Speichern mit Hierarchie-Check (Defense in Depth)
create or replace function public.save_rolle_berechtigungen(
  p_rolle text,
  p_berechtigungen jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bearbeiter text;
  v_eintrag jsonb;
  v_id text;
  v_aktiv boolean;
begin
  v_bearbeiter := public.jwt_rolle();

  if v_bearbeiter not in ('op_admin', 'administrator', 'manager') then
    raise exception 'Keine Berechtigung zum Bearbeiten von Rollen-Rechten';
  end if;

  if public.rolle_rang(p_rolle) <= public.rolle_rang(v_bearbeiter) and v_bearbeiter <> 'op_admin' then
    raise exception 'Diese Rolle darf nicht bearbeitet werden (Hierarchie)';
  end if;

  if p_rolle not in ('administrator', 'manager', 'mitarbeiter', 'leser') then
    raise exception 'Ungültige Ziel-Rolle';
  end if;

  delete from public.rolle_berechtigungen where rolle = p_rolle;

  for v_eintrag in select * from jsonb_array_elements(p_berechtigungen)
  loop
    v_id := v_eintrag ->> 'berechtigung_id';
    v_aktiv := coalesce((v_eintrag ->> 'aktiv')::boolean, false);

    insert into public.rolle_berechtigungen (rolle, berechtigung_id, aktiv, updated_by)
    values (p_rolle, v_id, v_aktiv, auth.uid());
  end loop;
end;
$$;

revoke all on function public.save_rolle_berechtigungen(text, jsonb) from public;
grant execute on function public.save_rolle_berechtigungen(text, jsonb) to authenticated;

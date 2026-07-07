-- Dynamische Rollen (System + benutzerdefiniert) mit konfigurierbarem Rang

create table if not exists public.rollen (
  id text primary key,
  bezeichnung text not null,
  beschreibung text not null default '',
  rang numeric not null,
  ist_system boolean not null default false,
  erstellt_von uuid references auth.users(id),
  erstellt_am timestamptz not null default now(),
  constraint rollen_id_format check (id ~ '^[a-z][a-z0-9_-]{1,48}$')
);

create index if not exists rollen_rang_idx on public.rollen (rang);

insert into public.rollen (id, bezeichnung, beschreibung, rang, ist_system)
values
  (
    'administrator',
    'Administrator',
    'Vollzugriff auf alle Mandanten und Konfiguration.',
    1,
    true
  ),
  (
    'manager',
    'Manager',
    'Führungsverantwortung mit Zugriff auf Verwaltung und operative Module.',
    2,
    true
  ),
  (
    'mitarbeiter',
    'Mitarbeiter',
    'Operativer Zugriff auf zugewiesene Aufgaben und Mandanten.',
    3,
    true
  ),
  (
    'leser',
    'Leser',
    'Nur-Lesen-Zugriff auf zugewiesene Mandanten.',
    4,
    true
  )
on conflict (id) do nothing;

-- rolle_berechtigungen: feste Rollen-Liste entfernen, FK auf rollen
alter table public.rolle_berechtigungen
  drop constraint if exists rolle_berechtigungen_rolle_check;

alter table public.rolle_berechtigungen
  drop constraint if exists rolle_berechtigungen_rolle_fk;

alter table public.rolle_berechtigungen
  add constraint rolle_berechtigungen_rolle_fk
  foreign key (rolle) references public.rollen (id) on delete cascade;

-- Policies kurz entfernen, damit rolle_rang (int → numeric) ersetzt werden kann
drop policy if exists "rolle_berechtigungen_insert_hierarchy" on public.rolle_berechtigungen;
drop policy if exists "rolle_berechtigungen_update_hierarchy" on public.rolle_berechtigungen;
drop policy if exists "rolle_berechtigungen_delete_hierarchy" on public.rolle_berechtigungen;

drop function if exists public.rolle_rang(text);

-- Rang aus rollen-Tabelle (op_admin bleibt systemseitig)
create or replace function public.rolle_rang(p_rolle text)
returns numeric
language sql
stable
as $$
  select case
    when p_rolle = 'op_admin' then 0::numeric
    else coalesce(
      (select r.rang from public.rollen r where r.id = p_rolle),
      99::numeric
    )
  end;
$$;

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

-- Effektive Berechtigung eines Bearbeiters (für Delegations-Check)
create or replace function public.bearbeiter_hat_berechtigung(
  p_bearbeiter text,
  p_berechtigung_id text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_bearbeiter = 'op_admin' then true
    when p_bearbeiter = 'administrator' then true
    when p_bearbeiter = 'manager' then coalesce(
      (
        select rb.aktiv
        from public.rolle_berechtigungen rb
        where rb.rolle = p_bearbeiter
          and rb.berechtigung_id = p_berechtigung_id
      ),
      p_berechtigung_id = any (array[
        'seite.dashboard',
        'seite.verwaltung.mandanten',
        'seite.verwaltung.objekte',
        'seite.verwaltung.einheiten',
        'seite.verwaltung.mietverhaeltnisse',
        'seite.verwaltung.sollstellung',
        'seite.verwaltung.zahlungen',
        'seite.verwaltung.nebenkosten',
        'seite.dokumente.ablage',
        'seite.dokumente.pruefordner',
        'seite.dokumente.audit',
        'seite.transaktionen.liste',
        'seite.transaktionen.expose_import',
        'seite.einstellungen.rollen',
        'aktion.dashboard.zeitraum.aendern',
        'aktion.mandant.wechseln',
        'aktion.verwaltung.mandanten.anlegen',
        'aktion.verwaltung.objekte.anlegen',
        'aktion.verwaltung.objekte.lesen',
        'aktion.verwaltung.mietverhaeltnisse.anlegen',
        'aktion.buchhaltung.sollstellung.erzeugen',
        'aktion.buchhaltung.zahlungen.bankimport',
        'aktion.buchhaltung.nebenkosten.abrechnung_erstellen',
        'aktion.buchhaltung.nebenkosten.kostenposition_anlegen',
        'aktion.buchhaltung.nebenkosten.pdf_exportieren',
        'aktion.dokumente.pruefordner.bestaetigen',
        'aktion.dokumente.pruefordner.neu_zuordnen',
        'aktion.dokumente.pruefordner.ablehnen',
        'aktion.transaktionen.expose_import.hochladen',
        'aktion.transaktionen.expose_import.uebernehmen',
        'aktion.transaktionen.expose_import.korrigieren',
        'aktion.transaktionen.expose_import.verwerfen',
        'aktion.einstellungen.rollen.bearbeiten',
        'aktion.einstellungen.rollen.anlegen'
      ]::text[])
    )
    else coalesce(
      (
        select rb.aktiv
        from public.rolle_berechtigungen rb
        where rb.rolle = p_bearbeiter
          and rb.berechtigung_id = p_berechtigung_id
      ),
      false
    )
  end;
$$;

revoke all on function public.bearbeiter_hat_berechtigung(text, text) from public;
grant execute on function public.bearbeiter_hat_berechtigung(text, text) to authenticated;

-- Batch-Speichern mit Hierarchie- und Delegations-Check
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

  if not exists (select 1 from public.rollen where id = p_rolle) then
    raise exception 'Ungültige Ziel-Rolle';
  end if;

  for v_eintrag in select * from jsonb_array_elements(p_berechtigungen)
  loop
    v_id := v_eintrag ->> 'berechtigung_id';
    v_aktiv := coalesce((v_eintrag ->> 'aktiv')::boolean, false);

    if v_aktiv and v_bearbeiter <> 'op_admin'
       and not public.bearbeiter_hat_berechtigung(v_bearbeiter, v_id) then
      raise exception 'Berechtigung % darf nicht vergeben werden (kein eigener Zugriff)', v_id;
    end if;
  end loop;

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

-- Neue Rolle anlegen (nur unterhalb der eigenen Stufe)
create or replace function public.create_rolle(
  p_id text,
  p_bezeichnung text,
  p_beschreibung text,
  p_unterhalb_von text
)
returns public.rollen
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bearbeiter text;
  v_basis_rang numeric;
  v_naechster_rang numeric;
  v_neuer_rang numeric;
  v_rolle public.rollen;
begin
  v_bearbeiter := public.jwt_rolle();

  if v_bearbeiter not in ('op_admin', 'administrator', 'manager') then
    raise exception 'Keine Berechtigung zum Anlegen von Rollen';
  end if;

  if p_id !~ '^[a-z][a-z0-9_-]{1,48}$' then
    raise exception 'Ungültige Rollen-ID (nur Kleinbuchstaben, Zahlen, Bindestrich, Unterstrich)';
  end if;

  if exists (select 1 from public.rollen where id = p_id) then
    raise exception 'Diese Rollen-ID existiert bereits';
  end if;

  select r.rang into v_basis_rang
  from public.rollen r
  where r.id = p_unterhalb_von;

  if v_basis_rang is null then
    raise exception 'Ungültige Bezugs-Rolle';
  end if;

  if v_bearbeiter <> 'op_admin'
     and v_basis_rang <= public.rolle_rang(v_bearbeiter) then
    raise exception 'Neue Rolle muss unterhalb Ihrer eigenen Stufe liegen';
  end if;

  select min(r.rang) into v_naechster_rang
  from public.rollen r
  where r.rang > v_basis_rang;

  if v_naechster_rang is not null then
    v_neuer_rang := (v_basis_rang + v_naechster_rang) / 2;
  else
    v_neuer_rang := v_basis_rang + 1;
  end if;

  insert into public.rollen (id, bezeichnung, beschreibung, rang, ist_system, erstellt_von)
  values (
    p_id,
    trim(p_bezeichnung),
    coalesce(trim(p_beschreibung), ''),
    v_neuer_rang,
    false,
    auth.uid()
  )
  returning * into v_rolle;

  return v_rolle;
end;
$$;

revoke all on function public.create_rolle(text, text, text, text) from public;
grant execute on function public.create_rolle(text, text, text, text) to authenticated;

alter table public.rollen enable row level security;

drop policy if exists "rollen_select_authenticated" on public.rollen;
drop policy if exists "rollen_insert_hierarchy" on public.rollen;
drop policy if exists "rollen_update_system_only" on public.rollen;
drop policy if exists "rollen_delete_custom_only" on public.rollen;

create policy "rollen_select_authenticated"
  on public.rollen
  for select
  to authenticated
  using (true);

create policy "rollen_insert_hierarchy"
  on public.rollen
  for insert
  to authenticated
  with check (
    ist_system = false
    and public.jwt_rolle() in ('op_admin', 'administrator', 'manager')
    and (
      public.jwt_rolle() = 'op_admin'
      or rang > public.rolle_rang(public.jwt_rolle())
    )
  );

create policy "rollen_update_system_only"
  on public.rollen
  for update
  to authenticated
  using (false);

create policy "rollen_delete_custom_only"
  on public.rollen
  for delete
  to authenticated
  using (
    ist_system = false
    and public.jwt_rolle() in ('op_admin', 'administrator', 'manager')
    and (
      public.jwt_rolle() = 'op_admin'
      or rang > public.rolle_rang(public.jwt_rolle())
    )
  );

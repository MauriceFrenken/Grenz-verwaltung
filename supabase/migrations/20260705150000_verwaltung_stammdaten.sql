-- Verwaltung: Mandanten, Objekte, Einheiten, Mietverhältnisse

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.objekt_status as enum ('aktiv', 'inaktiv', 'in_ankauf', 'verkauft');
create type public.einheit_status as enum ('vermietet', 'leerstand', 'wartung', 'reserviert');
create type public.mietverhaeltnis_status as enum ('aktiv', 'gekuendigt', 'beendet', 'geplant');

-- ---------------------------------------------------------------------------
-- Hilfsfunktionen
-- ---------------------------------------------------------------------------

create or replace function public.jwt_darf_schreiben()
returns boolean
language sql
stable
as $$
  select public.jwt_rolle() in (
    'op_admin', 'administrator', 'manager', 'mitarbeiter', 'verwaltung', 'buchhaltung', 'ankauf'
  );
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Mandanten
-- ---------------------------------------------------------------------------

create table public.mandanten (
  id text primary key,
  name text not null,
  kuerzel text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mandanten_id_format check (id ~ '^[a-z][a-z0-9_-]{1,48}$')
);

create trigger mandanten_updated_at
  before update on public.mandanten
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Objekte (→ Mandant)
-- ---------------------------------------------------------------------------

create table public.objekte (
  id text primary key,
  bezeichnung text not null,
  mandant_id text not null references public.mandanten (id) on delete restrict,
  strasse text not null,
  plz text not null,
  ort text not null,
  land text not null default 'DE',
  status public.objekt_status not null default 'aktiv',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint objekte_id_format check (id ~ '^[a-z][a-z0-9_-]{1,63}$')
);

create index objekte_mandant_id_idx on public.objekte (mandant_id);

create trigger objekte_updated_at
  before update on public.objekte
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Einheiten (→ Objekt)
-- ---------------------------------------------------------------------------

create table public.einheiten (
  id text primary key,
  objekt_id text not null references public.objekte (id) on delete cascade,
  lage text not null,
  flaeche_m2 numeric(10, 2) not null check (flaeche_m2 >= 0),
  aktuelles_mietverhaeltnis_id uuid,
  status public.einheit_status not null default 'leerstand',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint einheiten_id_format check (id ~ '^[a-z][a-z0-9_-]{1,63}$')
);

create index einheiten_objekt_id_idx on public.einheiten (objekt_id);

create trigger einheiten_updated_at
  before update on public.einheiten
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Mietverhältnisse (→ Einheit, → Objekt)
-- ---------------------------------------------------------------------------

create table public.mietverhaeltnisse (
  id uuid primary key default gen_random_uuid(),
  mieter_name text not null,
  einheit_id text not null references public.einheiten (id) on delete restrict,
  objekt_id text not null references public.objekte (id) on delete restrict,
  kaltmiete numeric(12, 2) not null check (kaltmiete >= 0),
  nk_vorauszahlung numeric(12, 2) not null default 0 check (nk_vorauszahlung >= 0),
  beginn date not null,
  ende date,
  status public.mietverhaeltnis_status not null default 'geplant',
  umlagefaehige_kostenarten text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mietverhaeltnis_ende_nach_beginn check (ende is null or ende >= beginn)
);

create index mietverhaeltnisse_einheit_id_idx on public.mietverhaeltnisse (einheit_id);
create index mietverhaeltnisse_objekt_id_idx on public.mietverhaeltnisse (objekt_id);
create index mietverhaeltnisse_status_idx on public.mietverhaeltnisse (status);

alter table public.einheiten
  add constraint einheiten_aktuelles_mv_fkey
  foreign key (aktuelles_mietverhaeltnis_id)
  references public.mietverhaeltnisse (id)
  on delete set null;

create trigger mietverhaeltnisse_updated_at
  before update on public.mietverhaeltnisse
  for each row execute function public.set_updated_at();

-- Objekt-ID aus Einheit ableiten; Einheit muss zum Objekt gehören
create or replace function public.mietverhaeltnis_vor_insert()
returns trigger
language plpgsql
as $$
declare
  v_objekt_id text;
begin
  select e.objekt_id into v_objekt_id
  from public.einheiten e
  where e.id = new.einheit_id;

  if v_objekt_id is null then
    raise exception 'Einheit % nicht gefunden', new.einheit_id;
  end if;

  if new.objekt_id is null or new.objekt_id = '' then
    new.objekt_id := v_objekt_id;
  elsif new.objekt_id <> v_objekt_id then
    raise exception 'Einheit % gehört nicht zu Objekt %', new.einheit_id, new.objekt_id;
  end if;

  return new;
end;
$$;

create trigger mietverhaeltnisse_vor_insert
  before insert on public.mietverhaeltnisse
  for each row execute function public.mietverhaeltnis_vor_insert();

-- Bei aktivem/geplantem MV: Einheit verknüpfen und Status setzen
create or replace function public.mietverhaeltnis_nach_aenderung()
returns trigger
language plpgsql
as $$
begin
  if new.status in ('aktiv', 'geplant') then
    update public.einheiten
    set
      aktuelles_mietverhaeltnis_id = new.id,
      status = case when new.status = 'aktiv' then 'vermietet'::public.einheit_status else status end
    where id = new.einheit_id
      and (aktuelles_mietverhaeltnis_id is null or aktuelles_mietverhaeltnis_id = new.id);
  end if;

  if tg_op = 'UPDATE' and new.status in ('beendet', 'gekuendigt') and old.status in ('aktiv', 'geplant') then
    update public.einheiten
    set
      aktuelles_mietverhaeltnis_id = null,
      status = 'leerstand'::public.einheit_status
    where id = new.einheit_id
      and aktuelles_mietverhaeltnis_id = new.id;
  end if;

  return new;
end;
$$;

create trigger mietverhaeltnisse_nach_insert
  after insert on public.mietverhaeltnisse
  for each row execute function public.mietverhaeltnis_nach_aenderung();

create trigger mietverhaeltnisse_nach_update
  after update of status on public.mietverhaeltnisse
  for each row execute function public.mietverhaeltnis_nach_aenderung();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.mandanten enable row level security;
alter table public.objekte enable row level security;
alter table public.einheiten enable row level security;
alter table public.mietverhaeltnisse enable row level security;

-- Lesen: alle authentifizierten User
create policy mandanten_select on public.mandanten for select to authenticated using (true);
create policy objekte_select on public.objekte for select to authenticated using (true);
create policy einheiten_select on public.einheiten for select to authenticated using (true);
create policy mietverhaeltnisse_select on public.mietverhaeltnisse for select to authenticated using (true);

-- Schreiben: Rollen mit Schreibrecht (Leser nur lesen)
create policy mandanten_write on public.mandanten for all to authenticated
  using (public.jwt_darf_schreiben()) with check (public.jwt_darf_schreiben());
create policy objekte_write on public.objekte for all to authenticated
  using (public.jwt_darf_schreiben()) with check (public.jwt_darf_schreiben());
create policy einheiten_write on public.einheiten for all to authenticated
  using (public.jwt_darf_schreiben()) with check (public.jwt_darf_schreiben());
create policy mietverhaeltnisse_write on public.mietverhaeltnisse for all to authenticated
  using (public.jwt_darf_schreiben()) with check (public.jwt_darf_schreiben());

-- ---------------------------------------------------------------------------
-- RPC: Mietverhältnis anlegen
-- ---------------------------------------------------------------------------

create or replace function public.create_mietverhaeltnis(
  p_mieter_name text,
  p_einheit_id text,
  p_kaltmiete numeric,
  p_nk_vorauszahlung numeric default 0,
  p_beginn date default current_date,
  p_ende date default null,
  p_status public.mietverhaeltnis_status default 'geplant',
  p_umlagefaehige_kostenarten text[] default '{}'
)
returns public.mietverhaeltnisse
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.mietverhaeltnisse;
  v_objekt_id text;
begin
  if not public.jwt_darf_schreiben() then
    raise exception 'Keine Berechtigung';
  end if;

  select objekt_id into v_objekt_id from public.einheiten where id = p_einheit_id;
  if v_objekt_id is null then
    raise exception 'Einheit nicht gefunden';
  end if;

  insert into public.mietverhaeltnisse (
    mieter_name, einheit_id, objekt_id, kaltmiete, nk_vorauszahlung,
    beginn, ende, status, umlagefaehige_kostenarten
  )
  values (
    p_mieter_name, p_einheit_id, v_objekt_id, p_kaltmiete, coalesce(p_nk_vorauszahlung, 0),
    p_beginn, p_ende, coalesce(p_status, 'geplant'), coalesce(p_umlagefaehige_kostenarten, '{}')
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.create_mietverhaeltnis(text, text, numeric, numeric, date, date, public.mietverhaeltnis_status, text[]) from public;
revoke execute on function public.create_mietverhaeltnis(text, text, numeric, numeric, date, date, public.mietverhaeltnis_status, text[]) from anon;
grant execute on function public.create_mietverhaeltnis(text, text, numeric, numeric, date, date, public.mietverhaeltnis_status, text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: Objekt + Einheiten + optionales Mietverhältnis (transaktional)
-- ---------------------------------------------------------------------------

create or replace function public.create_objekt_mit_einheiten(
  p_objekt jsonb,
  p_einheiten jsonb default '[]'::jsonb,
  p_mietverhaeltnis jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_objekt_id text;
  v_einheit jsonb;
  v_einheit_id text;
  v_erste_einheit_id text;
  v_mv public.mietverhaeltnisse;
begin
  if not public.jwt_darf_schreiben() then
    raise exception 'Keine Berechtigung';
  end if;

  v_objekt_id := p_objekt ->> 'id';
  if v_objekt_id is null or v_objekt_id = '' then
    raise exception 'Objekt-ID erforderlich';
  end if;

  insert into public.objekte (
    id, bezeichnung, mandant_id, strasse, plz, ort, land, status
  )
  values (
    v_objekt_id,
    p_objekt ->> 'bezeichnung',
    p_objekt ->> 'mandant_id',
    p_objekt ->> 'strasse',
    p_objekt ->> 'plz',
    p_objekt ->> 'ort',
    coalesce(p_objekt ->> 'land', 'DE'),
    coalesce((p_objekt ->> 'status')::public.objekt_status, 'aktiv')
  );

  for v_einheit in select * from jsonb_array_elements(p_einheiten)
  loop
    v_einheit_id := v_einheit ->> 'id';
    if v_einheit_id is null or v_einheit_id = '' then
      raise exception 'Einheit-ID erforderlich';
    end if;

    insert into public.einheiten (id, objekt_id, lage, flaeche_m2, status)
    values (
      v_einheit_id,
      v_objekt_id,
      v_einheit ->> 'lage',
      (v_einheit ->> 'flaeche_m2')::numeric,
      coalesce((v_einheit ->> 'status')::public.einheit_status, 'leerstand')
    );

    if v_erste_einheit_id is null then
      v_erste_einheit_id := v_einheit_id;
    end if;
  end loop;

  if p_mietverhaeltnis is not null then
    v_mv := public.create_mietverhaeltnis(
      p_mieter_name := p_mietverhaeltnis ->> 'mieter_name',
      p_einheit_id := coalesce(p_mietverhaeltnis ->> 'einheit_id', v_erste_einheit_id),
      p_kaltmiete := (p_mietverhaeltnis ->> 'kaltmiete')::numeric,
      p_nk_vorauszahlung := coalesce((p_mietverhaeltnis ->> 'nk_vorauszahlung')::numeric, 0),
      p_beginn := coalesce((p_mietverhaeltnis ->> 'beginn')::date, current_date),
      p_ende := nullif(p_mietverhaeltnis ->> 'ende', '')::date,
      p_status := coalesce((p_mietverhaeltnis ->> 'status')::public.mietverhaeltnis_status, 'geplant'),
      p_umlagefaehige_kostenarten := coalesce(
        array(select jsonb_array_elements_text(p_mietverhaeltnis -> 'umlagefaehige_kostenarten')),
        '{}'::text[]
      )
    );
  end if;

  return jsonb_build_object('objekt_id', v_objekt_id);
end;
$$;

revoke all on function public.create_objekt_mit_einheiten(jsonb, jsonb, jsonb) from public;
revoke execute on function public.create_objekt_mit_einheiten(jsonb, jsonb, jsonb) from anon;
grant execute on function public.create_objekt_mit_einheiten(jsonb, jsonb, jsonb) to authenticated;

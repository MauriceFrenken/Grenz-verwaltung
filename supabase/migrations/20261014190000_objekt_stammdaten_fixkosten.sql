-- Objekt-Stammdaten für Rendite und Eigenkapital, feste Kosten je Objekt.
-- Quelle: Stammdaten-Vorlage von Maurice (14.10.2026).

alter table public.objekte
  add column if not exists kaufnebenkosten numeric(14, 2)
    check (kaufnebenkosten is null or kaufnebenkosten >= 0),
  add column if not exists eigenkapital numeric(14, 2),
  add column if not exists wohnflaeche_m2 numeric(10, 2)
    check (wohnflaeche_m2 is null or wohnflaeche_m2 >= 0);

comment on column public.objekte.kaufnebenkosten is 'Notar, Grundbuch, Grunderwerbsteuer, Makler';
comment on column public.objekte.eigenkapital is 'Eingesetztes Eigenkapital (Kaufpreis + Nebenkosten - Bankdarlehen)';
comment on column public.objekte.wohnflaeche_m2 is 'Wohnfläche gesamt laut Stammdaten';

create table if not exists public.objekt_fixkosten (
  id uuid primary key default gen_random_uuid(),
  objekt_id text not null references public.objekte(id) on update cascade on delete cascade,
  kostenart text not null check (length(btrim(kostenart)) > 0),
  betrag numeric(12, 2) not null check (betrag >= 0),
  rhythmus text not null
    check (rhythmus in ('monatlich', 'quartalsweise', 'halbjaehrlich', 'jaehrlich')),
  faellig_ab date,
  umlagefaehig boolean,
  empfaenger text,
  bemerkung text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (objekt_id, kostenart)
);

comment on table public.objekt_fixkosten is 'Wiederkehrende Kosten je Objekt (Betrag je Fälligkeit)';

alter table public.objekt_fixkosten enable row level security;
create policy objekt_fixkosten_select on public.objekt_fixkosten
  for select to authenticated using (true);
create policy objekt_fixkosten_write on public.objekt_fixkosten for all to authenticated
  using (public.jwt_darf_schreiben()) with check (public.jwt_darf_schreiben());

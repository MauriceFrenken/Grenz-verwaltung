-- IBAN des Mieters: erwarteter Zahlungseingang in Kontoauszuegen.

alter table public.mietverhaeltnisse
  add column iban text
  constraint mietverhaeltnisse_iban_format_check check (
    iban is null
    or (
      length(iban) between 15 and 34
      and iban ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]+$'
    )
  );

comment on column public.mietverhaeltnisse.iban is
  'IBAN, von der Mieteingänge für dieses Mietverhältnis erwartet werden (ohne Leerzeichen, Großbuchstaben).';

create index mietverhaeltnisse_iban_idx
  on public.mietverhaeltnisse (iban)
  where iban is not null;

create or replace view public.v_mietverhaeltnisse with (security_invoker = on) as
select
  m.id,
  m.einheit_id,
  e.lage        as einheit_lage,
  e.hausteil,
  e.nutzungsart,
  e.flaeche_m2,
  o.id          as objekt_id,
  o.bezeichnung as objekt_bezeichnung,
  g.id          as gesellschaft_id,
  g.name        as gesellschaft_name,
  m.mieter_name,
  m.beginn,
  m.ende,
  m.letzte_mieterhoehung,
  m.kaltmiete,
  m.nk_vorauszahlung,
  m.kaltmiete * 12 as kaltmiete_jahr,
  case
    when coalesce(e.flaeche_m2, 0) > 0 and m.kaltmiete > 0
      then round(m.kaltmiete / e.flaeche_m2, 2)
  end           as miete_pro_m2,
  m.status,
  m.bemerkung,
  m.created_at,
  m.updated_at,
  m.iban
from public.mietverhaeltnisse m
join public.einheiten e on e.id = m.einheit_id
join public.objekte o on o.id = e.objekt_id
join public.gesellschaften g on g.id = o.gesellschaft_id;

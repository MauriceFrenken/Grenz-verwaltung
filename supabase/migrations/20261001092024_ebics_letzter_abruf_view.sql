-- Aus der Produktivdatenbank übernommen (08.10.2026): war angewendet, fehlte im Repo.
create or replace view public.v_ebics_kunden
with (security_invoker = on)
as
select
  k.id,
  k.gesellschaft_id,
  g.name as gesellschaft_name,
  g.kuerzel as gesellschaft_kuerzel,
  k.status,
  k.letzter_fehler,
  k.initialisiert_am,
  k.bereit_am,
  k.updated_at,
  (
    select count(*)::integer
    from public.ebics_konten c
    where c.ebics_kunde_id = k.id and c.aktiv
  ) as anzahl_konten,
  exists (
    select 1 from public.ebics_schluessel s where s.ebics_kunde_id = k.id
  ) as hat_schluessel,
  la.created_at as letzter_abruf_am,
  la.erfolgreich as letzter_abruf_erfolgreich,
  la.fehler as letzter_abruf_fehler,
  la.anzahl_buchungen as letzter_abruf_anzahl,
  la.zeitraum_von as letzter_abruf_von,
  la.zeitraum_bis as letzter_abruf_bis
from public.ebics_kunden k
join public.gesellschaften g on g.id = k.gesellschaft_id
left join lateral (
  select
    a.created_at,
    a.erfolgreich,
    a.fehler,
    a.anzahl_buchungen,
    a.zeitraum_von,
    a.zeitraum_bis
  from public.ebics_abrufe a
  where a.ebics_kunde_id = k.id
  order by a.created_at desc
  limit 1
) la on true;

grant select on public.v_ebics_kunden to authenticated;

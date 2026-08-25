-- Quelldatei-Spalte und -Hinweise entfernen (kein Import-Dateiname in App/DB).

update public.einheiten
set bemerkung = case
  when bemerkung = 'Nur Nachname in Quelldatei' then 'Nur Nachname hinterlegt'
  when bemerkung = 'Leerstand laut Mieterliste' then 'Leerstand'
  when bemerkung = 'Kein Mieter in Quelldatei hinterlegt' then 'Kein Mieter hinterlegt'
  when bemerkung = 'Fläche und Miete fehlen in Quelldatei' then 'Fläche und Miete fehlen'
  when bemerkung = 'Keine Daten in Quelldatei' then 'Keine Daten'
  when bemerkung = 'Mietername hinterlegt, Status laut Quelle ''leer'' - bitte prüfen'
    then 'Mietername hinterlegt, Status leer - bitte prüfen'
  when bemerkung like 'Aufteilung Aufgang A/B abgeleitet aus Quelldatei%'
    then 'Aufteilung Aufgang A/B – Hausnummern-Zuordnung bitte bestätigen'
  else bemerkung
end
where bemerkung is not null
  and (
    bemerkung ilike '%quelldatei%'
    or bemerkung ilike '%mieterliste%'
    or bemerkung ilike '%laut quelle%'
  );

drop view if exists public.v_gesellschaften;
drop view if exists public.v_objekte;

alter table public.objekte drop column if exists quelldatei;

create view public.v_objekte with (security_invoker = on) as
select
  o.id,
  o.gesellschaft_id,
  g.name as gesellschaft_name,
  o.bezeichnung,
  o.strasse,
  o.plz,
  o.ort,
  o.land,
  o.status,
  o.bemerkung,
  coalesce(k.einheiten_gesamt, 0)    as einheiten_gesamt,
  coalesce(k.einheiten_wohnen, 0)    as einheiten_wohnen,
  coalesce(k.einheiten_stellplatz, 0) as einheiten_stellplatz,
  coalesce(k.einheiten_vermietet, 0) as einheiten_vermietet,
  coalesce(k.einheiten_leer, 0)      as einheiten_leer,
  coalesce(k.wohnflaeche_m2, 0)      as wohnflaeche_m2,
  coalesce(k.kaltmiete, 0)           as kaltmiete,
  coalesce(k.kaltmiete, 0) * 12      as kaltmiete_jahr,
  case
    when coalesce(k.wohnflaeche_wohnen_m2, 0) > 0
      then round(coalesce(k.kaltmiete_wohnen, 0) / k.wohnflaeche_wohnen_m2, 2)
  end                                as miete_pro_m2_wohnen,
  o.created_at,
  o.updated_at
from public.objekte o
join public.gesellschaften g on g.id = o.gesellschaft_id
left join lateral (
  select
    count(*)                                                          as einheiten_gesamt,
    count(*) filter (where e.nutzungsart = 'wohnen')                  as einheiten_wohnen,
    count(*) filter (where e.nutzungsart in ('garage', 'stellplatz')) as einheiten_stellplatz,
    count(*) filter (where e.status = 'vermietet')                    as einheiten_vermietet,
    count(*) filter (where e.status <> 'vermietet')                   as einheiten_leer,
    sum(e.flaeche_m2)                                                 as wohnflaeche_m2,
    sum(e.kaltmiete)                                                  as kaltmiete,
    sum(e.flaeche_m2) filter (where e.nutzungsart = 'wohnen')         as wohnflaeche_wohnen_m2,
    sum(e.kaltmiete) filter (where e.nutzungsart = 'wohnen')          as kaltmiete_wohnen
  from public.v_einheiten e
  where e.objekt_id = o.id
) k on true;

create view public.v_gesellschaften with (security_invoker = on) as
select
  g.id,
  g.name,
  g.kuerzel,
  g.datev_postfach,
  g.datev_postfach_bezeichnung,
  g.bemerkung,
  coalesce(k.objekte_liste, '')      as objekte_liste,
  coalesce(k.anzahl_objekte, 0)      as anzahl_objekte,
  coalesce(k.anzahl_einheiten, 0)    as anzahl_einheiten,
  coalesce(k.kaltmiete, 0)           as kaltmiete,
  coalesce(k.kaltmiete, 0) * 12      as kaltmiete_jahr,
  g.created_at,
  g.updated_at
from public.gesellschaften g
left join lateral (
  select
    count(*)                          as anzahl_objekte,
    sum(o.einheiten_gesamt)           as anzahl_einheiten,
    sum(o.kaltmiete)                  as kaltmiete,
    string_agg(
      o.bezeichnung || case when o.ort <> '' then ', ' || o.ort else '' end,
      '; ' order by o.id
    )                                 as objekte_liste
  from public.v_objekte o
  where o.gesellschaft_id = g.id
) k on true;

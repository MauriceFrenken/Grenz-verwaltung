-- Übersicht pro Darlehen: aktueller Saldo, Zinsen lfd. Jahr, Hinweise
create or replace view public.darlehen_stand with (security_invoker = true) as
with b as (
  select distinct on (darlehen_id, buchungsdatum, abs(betrag), typ)
    darlehen_id, buchungsdatum, abs(betrag) betrag, typ, coalesce(zins_anteil,0) zins, coalesce(tilgung_anteil,0) tilg
  from public.darlehen_buchungen
  order by darlehen_id, buchungsdatum, abs(betrag), typ, (seite = 'nehmer') desc
), agg as (
  select b.darlehen_id,
    sum(b.tilg) tilgung_gesamt,
    sum(b.tilg) filter (where b.buchungsdatum > d.saldo_am) tilgung_nach_saldo,
    sum(b.zins) filter (where extract(year from b.buchungsdatum) = extract(year from current_date)) zinsen_lfd_jahr,
    max(b.buchungsdatum) filter (where b.zins > 0) letzte_zinszahlung,
    max(b.buchungsdatum) filter (where b.typ = 'Auszahlung') letzte_auszahlung,
    max(b.buchungsdatum) letzte_buchung,
    count(*) filter (where b.typ = 'unklar') unklare_buchungen
  from b join public.darlehen d on d.id = b.darlehen_id
  group by b.darlehen_id
)
select d.id, d.art, d.status, d.geber_gesellschaft_id, d.geber_person_id, d.nehmer_gesellschaft_id, d.nehmer_person_id, d.objekt_id,
  d.betrag, d.zins_pa, d.zins_art, d.zinsbindung_bis, d.vertragsdatum, d.ende, d.tilgung, d.rate_monatlich, d.tilgung_monatlich,
  d.nicht_abgerufen, d.saldo saldo_bank, d.saldo_am,
  case when d.status <> 'aktiv' then 0
       when d.saldo is not null then greatest(d.saldo - coalesce(a.tilgung_nach_saldo,0), 0)
       else greatest(d.betrag - coalesce(a.tilgung_gesamt,0), 0) end saldo_aktuell,
  coalesce(a.tilgung_gesamt,0) rueckzahlungen,
  coalesce(a.zinsen_lfd_jahr,0) zinsen_lfd_jahr,
  a.letzte_zinszahlung, a.letzte_buchung, coalesce(a.unklare_buchungen,0) unklare_buchungen,
  round(case when d.status = 'aktiv' then coalesce(d.saldo, d.betrag - coalesce(a.tilgung_gesamt,0)) * coalesce(d.zins_pa,0) / 100 end, 2) zinsen_pa_rechnerisch,
  case when d.status = 'aktiv' and d.ende is not null and d.ende < current_date then 'überfällig'
       when d.status = 'aktiv' and d.saldo is null and coalesce(a.tilgung_gesamt,0) >= d.betrag then 'vermutlich zurückgezahlt'
       when d.status = 'aktiv' and d.zinsbindung_bis is not null and d.zinsbindung_bis <= current_date + interval '12 months' then 'Zinsbindung endet'
       when d.status = 'aktiv' and d.ende is not null and d.ende <= current_date + interval '90 days' then 'bald fällig'
       when coalesce(a.unklare_buchungen,0) > 0 then 'Buchung prüfen'
  end hinweis
from public.darlehen d
left join agg a on a.darlehen_id = d.id;
grant select on public.darlehen_stand to authenticated;
revoke all on public.darlehen_stand from anon;

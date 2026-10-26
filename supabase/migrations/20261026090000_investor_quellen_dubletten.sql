-- Dubletten in den externen Listen: Haupteintrag vereint die Angaben, Dubletten verweisen darauf.
alter table public.investor_quellen
  add column if not exists dublette_von text references public.investor_quellen(schluessel) on delete set null;
create index if not exists investor_quellen_dublette_idx on public.investor_quellen (dublette_von);
comment on column public.investor_quellen.dublette_von is 'Schlüssel des Haupteintrags, wenn dieser Eintrag dieselbe Firma oder Person ist (gleicher Name oder gleiche E-Mail). Gesetzt von quellenBereinigen.';

create or replace function public.investor_pruefung_kandidaten(anzahl integer)
returns table (schluessel text, firma text, webseite text, ort text)
language sql stable security invoker set search_path = public as $$
  with kandidaten as (
    select 'acc:' || i.account_sf_id as schluessel, i.name as firma,
           nullif(k.sf_daten->>'Website', '') as webseite, k.ort,
           case i.status when 'aktiv' then 0 when 'ruhend' then 1 else 2 end as rang, 100 as passung
      from investoren i
      left join sf_kontakte k on k.sf_id = i.account_sf_id
     where i.typ is distinct from 'Privat'
    union all
    (select distinct on (q.firma) 'quelle:' || q.schluessel, q.firma, q.webseite, q.ort, 3, q.passung
      from investor_quellen q
     where q.firma is not null and not q.nicht_anlegen and q.bearbeitung = 'offen'
       and q.sf_account_sf_id is null and q.quelle <> 'suchkunden'
       and q.dublette_von is null
     order by q.firma, q.passung desc)
  )
  select k.schluessel, k.firma, k.webseite, k.ort
    from kandidaten k
    left join investor_pruefungen p on p.schluessel = k.schluessel
   where p.schluessel is null or p.geprueft_am < now() - interval '180 days'
   order by k.rang, k.passung desc, k.firma
   limit anzahl;
$$;
revoke execute on function public.investor_pruefung_kandidaten(integer) from public, anon, authenticated;

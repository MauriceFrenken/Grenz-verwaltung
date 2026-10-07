-- Ordnet neue Bankbuchungen automatisch Darlehen zu (Regel A: Darlehenskonto-IBAN, Regel B: Darlehens-ID oder Parteien + Stichwort)
create or replace function public.darlehen_buchungen_zuordnen()
 returns integer language plpgsql security definer set search_path to 'public'
as $function$
declare n1 integer := 0; n2 integer := 0;
begin
  -- Regel A: Bankdarlehen über die IBAN des Darlehenskontos im Verwendungszweck
  insert into darlehen_buchungen (darlehen_id, bankbuchung_id, fingerprint, buchungsdatum, betrag, gesellschaft_id, seite, typ, zins_anteil, tilgung_anteil, regel)
  select distinct on (d.id, coalesce(b.fingerprint, b.id::text))
    d.id, b.id, b.fingerprint, b.buchungsdatum, b.betrag, a.gesellschaft_id, 'bank',
    case when b.verwendungszweck ~* 'RECHN\.?\s*ZINS' then 'Rate'
         when b.verwendungszweck ~* 'TILG' then 'Tilgung'
         when b.auftraggeber_name ~* 'DARLEHENSABSCHLUSS' and not exists (select 1 from bankbuchungen u where u.buchungsdatum = b.buchungsdatum and u.auftraggeber_name ~* 'UST' and u.verwendungszweck like '%' || d.darlehenskonto_iban || '%') then 'Zinsen'
         when b.verwendungszweck ~* 'ZINS' then 'Zinsen'
         when b.betrag > 0 then 'Auszahlung' else 'unklar' end,
    case when b.verwendungszweck ~* 'RECHN\.?\s*ZINS' then de_betrag(substring(b.verwendungszweck from 'RECHN\.?\s*ZINS\s*([0-9.]+,[0-9]{2})'))
         when b.verwendungszweck ~* 'ZINS' and b.verwendungszweck !~* 'TILG' then abs(b.betrag)
         when b.auftraggeber_name ~* 'DARLEHENSABSCHLUSS' and not exists (select 1 from bankbuchungen u where u.buchungsdatum = b.buchungsdatum and u.auftraggeber_name ~* 'UST' and u.verwendungszweck like '%' || d.darlehenskonto_iban || '%') then abs(b.betrag) end,
    case when b.verwendungszweck ~* 'RECHN\.?\s*ZINS' then de_betrag(substring(b.verwendungszweck from 'TILG\.?/?\s*ENTG\.?\s*([0-9.]+,[0-9]{2})'))
         when b.verwendungszweck ~* 'TILG' then abs(b.betrag) end,
    'IBAN Darlehenskonto'
  from darlehen d
  join bankbuchungen b on d.darlehenskonto_iban is not null
       and replace(upper(b.verwendungszweck),' ','') like '%' || upper(replace(d.darlehenskonto_iban,' ','')) || '%'
  join bankauszuege a on a.id = b.bankauszug_id
  where not exists (select 1 from darlehen_buchungen x where x.bankbuchung_id = b.id)
  on conflict do nothing;
  get diagnostics n1 = row_count;

  -- Regel B: interne Darlehen über Darlehens-ID oder Vertragsparteien + Stichwort
  with parteien as (
    select d.id did, d.betrag dbetrag, d.vertragsdatum dvd, d.status dstatus,
           d.geber_gesellschaft_id gg, d.nehmer_gesellschaft_id ng,
           norm_name(coalesce(g1.name, p1.firma, trim(coalesce(p1.vorname,'')||' '||coalesce(p1.nachname,'')))) geber_n,
           norm_name(coalesce(g2.name, p2.firma, trim(coalesce(p2.vorname,'')||' '||coalesce(p2.nachname,'')))) nehmer_n
    from darlehen d
    left join gesellschaften g1 on g1.id = d.geber_gesellschaft_id
    left join gesellschaften g2 on g2.id = d.nehmer_gesellschaft_id
    left join personen p1 on p1.id = d.geber_person_id
    left join personen p2 on p2.id = d.nehmer_person_id
    where d.art <> 'bank'
  ), kand as (
    select b.id bid, b.fingerprint fp, b.buchungsdatum bdat, b.betrag bbetrag, b.verwendungszweck vz, a.gesellschaft_id gid, p.did,
      case when p.gg = a.gesellschaft_id then 'geber' else 'nehmer' end seite,
      (case when b.verwendungszweck ilike '%' || p.did || '%' then 100 else 0 end
       + case when p.dvd is not null and b.verwendungszweck like '%' || to_char(p.dvd,'DD.MM.YYYY') || '%' then 20 else 0 end
       + case when b.verwendungszweck ~* ('(^|[^0-9])' || trim(to_char(p.dbetrag/1000,'FM999999')) || '\s?k') then 20 else 0 end
       + case when b.verwendungszweck like '%' || replace(to_char(trunc(p.dbetrag),'FM999,999,999'), ',', '.') || '%' then 20 else 0 end
       + case when p.dstatus = 'aktiv' then 5 else 0 end
       + case when p.dvd is not null and abs(b.buchungsdatum - p.dvd) <= 5 then 10 else 0 end) score
    from bankbuchungen b
    join bankauszuege a on a.id = b.bankauszug_id
    join parteien p on (
         b.verwendungszweck ilike '%' || p.did || '%'
      or (b.verwendungszweck ~* 'darl|zins'
          and ((p.gg = a.gesellschaft_id and length(p.nehmer_n) > 3 and length(norm_name(b.auftraggeber_name)) > 3
                and (norm_name(b.auftraggeber_name) like p.nehmer_n || '%' or p.nehmer_n like norm_name(b.auftraggeber_name) || '%'))
            or (p.ng = a.gesellschaft_id and length(p.geber_n) > 3 and length(norm_name(b.auftraggeber_name)) > 3
                and (norm_name(b.auftraggeber_name) like p.geber_n || '%' or p.geber_n like norm_name(b.auftraggeber_name) || '%')))))
    where not exists (select 1 from darlehen_buchungen x where x.bankbuchung_id = b.id)
  ), best as (
    select k.*, rank() over (partition by k.bid order by k.score desc) rk, count(*) over (partition by k.bid, k.score) gleich
    from kand k
  )
  insert into darlehen_buchungen (darlehen_id, bankbuchung_id, fingerprint, buchungsdatum, betrag, gesellschaft_id, seite, typ, zins_anteil, tilgung_anteil, regel)
  select distinct on (s.did, coalesce(s.fp, s.bid::text))
    s.did, s.bid, s.fp, s.bdat, s.bbetrag, s.gid, s.seite,
    case when s.vz ~* 'zins' and s.vz !~* 'inkl' then 'Zinsen'
         when (s.seite = 'geber' and s.bbetrag < 0) or (s.seite = 'nehmer' and s.bbetrag > 0) then 'Auszahlung'
         else 'Rückzahlung' end,
    case when s.vz ~* 'zins' and s.vz !~* 'inkl' then abs(s.bbetrag) end,
    case when not (s.vz ~* 'zins' and s.vz !~* 'inkl') and ((s.seite = 'geber' and s.bbetrag > 0) or (s.seite = 'nehmer' and s.bbetrag < 0)) then abs(s.bbetrag) end,
    case when s.score >= 100 then 'Darlehens-ID im Verwendungszweck' else 'Parteien + Stichwort (Score ' || s.score || ')' end
  from best s
  where s.rk = 1 and s.gleich = 1
  on conflict do nothing;
  get diagnostics n2 = row_count;
  return n1 + n2;
end $function$;

revoke execute on function public.darlehen_buchungen_zuordnen() from public, anon;
grant execute on function public.darlehen_buchungen_zuordnen() to authenticated;

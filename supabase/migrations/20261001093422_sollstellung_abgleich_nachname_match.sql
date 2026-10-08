-- Aus der Produktivdatenbank übernommen (08.10.2026): war angewendet, fehlte im Repo.
-- Die ursprüngliche Migration enthielt danach noch einen einmaligen Abgleichslauf
-- für eine konkrete Sollstellung; der ist hier bewusst weggelassen.
create or replace function public.gleiche_sollstellung_ab(p_lauf_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_zeitraum text;
  v_monat_start date;
  v_monat_ende date;
  r_iban record;
  r_pos record;
  r_match record;
  v_ist_total numeric(12, 2);
  v_rest numeric(12, 2);
  v_take numeric(12, 2);
  v_pos_ids uuid[];
  v_i int;
  v_primary uuid;
begin
  if not public.jwt_darf_schreiben()
     and coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Keine Berechtigung';
  end if;

  select l.zeitraum into v_zeitraum
  from public.sollstellung_laeufe l
  where l.id = p_lauf_id;

  if v_zeitraum is null then
    raise exception 'Sollstellung nicht gefunden';
  end if;

  v_monat_start := (v_zeitraum || '-01')::date;
  v_monat_ende := (v_monat_start + interval '1 month - 1 day')::date;

  delete from public.sollstellung_zuordnungen z
  using public.sollstellung_positionen p
  where z.position_id = p.id
    and p.lauf_id = p_lauf_id;

  update public.sollstellung_positionen p
  set
    ist_betrag = 0,
    differenz = p.soll_betrag,
    status = public.sollstellung_position_status_berechnen(p.iban, p.soll_betrag, 0),
    updated_at = now()
  where p.lauf_id = p_lauf_id;

  for r_iban in
    select distinct p.iban, p.gesellschaft_id
    from public.sollstellung_positionen p
    where p.lauf_id = p_lauf_id
      and p.iban is not null
      and btrim(p.iban) <> ''
  loop
    select coalesce(sum(b.betrag), 0)
      into v_ist_total
    from public.bankauszuege ba
    join public.bankbuchungen b on b.bankauszug_id = ba.id
    where ba.lauf_id = p_lauf_id
      and ba.gesellschaft_id = r_iban.gesellschaft_id
      and b.gegenkonto_iban = r_iban.iban
      and b.betrag > 0
      and b.buchungsdatum between v_monat_start and v_monat_ende;

    select array_agg(p.id order by p.soll_betrag desc, p.einheit_lage, p.id)
      into v_pos_ids
    from public.sollstellung_positionen p
    where p.lauf_id = p_lauf_id
      and p.iban = r_iban.iban
      and p.gesellschaft_id = r_iban.gesellschaft_id;

    if v_pos_ids is null or cardinality(v_pos_ids) = 0 then
      continue;
    end if;

    v_primary := v_pos_ids[1];
    v_rest := v_ist_total;

    for v_i in 1 .. cardinality(v_pos_ids) loop
      select * into r_pos from public.sollstellung_positionen p where p.id = v_pos_ids[v_i];
      v_take := least(v_rest, r_pos.soll_betrag);
      update public.sollstellung_positionen
      set ist_betrag = v_take, differenz = soll_betrag - v_take,
          status = public.sollstellung_position_status_berechnen(iban, soll_betrag, v_take), updated_at = now()
      where id = v_pos_ids[v_i];
      v_rest := v_rest - v_take;
    end loop;

    if v_rest > 0 then
      update public.sollstellung_positionen
      set ist_betrag = ist_betrag + v_rest,
          differenz = soll_betrag - (ist_betrag + v_rest),
          status = public.sollstellung_position_status_berechnen(iban, soll_betrag, ist_betrag + v_rest),
          updated_at = now()
      where id = v_primary;
    end if;

    insert into public.sollstellung_zuordnungen (position_id, bankbuchung_id, betrag)
    select v_primary, b.id, b.betrag
    from public.bankauszuege ba
    join public.bankbuchungen b on b.bankauszug_id = ba.id
    where ba.lauf_id = p_lauf_id and ba.gesellschaft_id = r_iban.gesellschaft_id
      and b.gegenkonto_iban = r_iban.iban and b.betrag > 0
      and b.buchungsdatum between v_monat_start and v_monat_ende
    on conflict (position_id, bankbuchung_id) do nothing;
  end loop;

  for r_match in
    with frei as (
      select b.id as bankbuchung_id, ba.gesellschaft_id, b.betrag, b.gegenkonto_iban,
        coalesce(b.auftraggeber_name, '') as name, coalesce(b.verwendungszweck, '') as zweck
      from public.bankauszuege ba
      join public.bankbuchungen b on b.bankauszug_id = ba.id
      where ba.lauf_id = p_lauf_id and b.betrag > 0 and b.betrag < 5000
        and b.buchungsdatum between v_monat_start and v_monat_ende
        and not exists (select 1 from public.sollstellung_zuordnungen z where z.bankbuchung_id = b.id)
    ),
    kandidaten as (
      select f.bankbuchung_id, f.betrag, f.gegenkonto_iban, p.id as position_id,
        p.mietverhaeltnis_id, p.iban as position_iban, p.mieter_name,
        row_number() over (
          partition by f.bankbuchung_id
          order by
            case when lower(f.name) like '%' || lower(p.mieter_name) || '%' then 0 else 1 end,
            abs(p.soll_betrag - f.betrag), p.soll_betrag desc, p.id
        ) as rn_buchung,
        count(*) over (partition by f.bankbuchung_id) as treffer_buchung,
        count(*) over (partition by p.id) as treffer_pos
      from frei f
      join public.sollstellung_positionen p
        on p.lauf_id = p_lauf_id and p.gesellschaft_id = f.gesellschaft_id
       and p.ist_betrag = 0 and char_length(btrim(p.mieter_name)) >= 4
       and (
         lower(f.name) like '%' || lower(btrim(p.mieter_name)) || '%'
         or lower(f.zweck) like '%' || lower(btrim(p.mieter_name)) || '%'
         or (
           position(',' in p.mieter_name) > 0
           and char_length(btrim(split_part(p.mieter_name, ',', 1))) >= 4
           and (
             lower(f.name) like '%' || lower(btrim(split_part(p.mieter_name, ',', 1))) || '%'
             or lower(f.zweck) like '%' || lower(btrim(split_part(p.mieter_name, ',', 1))) || '%'
           )
         )
       )
    )
    select * from kandidaten where rn_buchung = 1 and treffer_buchung = 1 and treffer_pos = 1
  loop
    update public.sollstellung_positionen
    set ist_betrag = r_match.betrag, differenz = soll_betrag - r_match.betrag,
      iban = coalesce(nullif(btrim(iban), ''), r_match.gegenkonto_iban),
      status = public.sollstellung_position_status_berechnen(
        coalesce(nullif(btrim(iban), ''), r_match.gegenkonto_iban), soll_betrag, r_match.betrag),
      updated_at = now()
    where id = r_match.position_id;

    insert into public.sollstellung_zuordnungen (position_id, bankbuchung_id, betrag)
    values (r_match.position_id, r_match.bankbuchung_id, r_match.betrag)
    on conflict (position_id, bankbuchung_id) do nothing;

    if r_match.gegenkonto_iban is not null
       and (r_match.position_iban is null or btrim(r_match.position_iban) = '') then
      update public.mietverhaeltnisse m
      set iban = r_match.gegenkonto_iban, updated_at = now()
      where m.id = r_match.mietverhaeltnis_id and (m.iban is null or btrim(m.iban) = '');
    end if;
  end loop;
end;
$$;

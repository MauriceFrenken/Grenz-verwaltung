-- Abgleich: Bankeingänge je IBAN einmalig auf alle Positionen mit derselben IBAN verteilen
-- (Wohnung + Garage / Stellplatz teilen oft eine IBAN und eine Überweisung).

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
  v_ist_total numeric(12, 2);
  v_rest numeric(12, 2);
  v_take numeric(12, 2);
  v_pos_ids uuid[];
  v_i int;
  v_primary uuid;
begin
  if not public.jwt_darf_schreiben() then
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
  where p.lauf_id = p_lauf_id
    and (p.iban is null or btrim(p.iban) = '');

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

    -- 1) Soll der Reihe nach decken (größtes Soll zuerst)
    for v_i in 1 .. cardinality(v_pos_ids) loop
      select * into r_pos
      from public.sollstellung_positionen p
      where p.id = v_pos_ids[v_i];

      v_take := least(v_rest, r_pos.soll_betrag);

      update public.sollstellung_positionen
      set
        ist_betrag = v_take,
        differenz = soll_betrag - v_take,
        status = public.sollstellung_position_status_berechnen(iban, soll_betrag, v_take),
        updated_at = now()
      where id = v_pos_ids[v_i];

      v_rest := v_rest - v_take;
    end loop;

    -- 2) Überschuss auf die Hauptposition (Wohnung)
    if v_rest > 0 then
      update public.sollstellung_positionen
      set
        ist_betrag = ist_betrag + v_rest,
        differenz = soll_betrag - (ist_betrag + v_rest),
        status = public.sollstellung_position_status_berechnen(
          iban,
          soll_betrag,
          ist_betrag + v_rest
        ),
        updated_at = now()
      where id = v_primary;
    end if;

    insert into public.sollstellung_zuordnungen (position_id, bankbuchung_id, betrag)
    select
      v_primary,
      b.id,
      b.betrag
    from public.bankauszuege ba
    join public.bankbuchungen b on b.bankauszug_id = ba.id
    where ba.lauf_id = p_lauf_id
      and ba.gesellschaft_id = r_iban.gesellschaft_id
      and b.gegenkonto_iban = r_iban.iban
      and b.betrag > 0
      and b.buchungsdatum between v_monat_start and v_monat_ende
    on conflict (position_id, bankbuchung_id) do nothing;
  end loop;
end;
$$;

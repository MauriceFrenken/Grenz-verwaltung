-- Neuer EBICS-Zugang Volksbank im Westen (MV135500 / FRENKENM).
-- Platzhalter: G-09 FB — Gesellschaftszuordnung später korrigierbar.

insert into public.ebics_kunden
  (gesellschaft_id, partner_id, user_id, host_id, url, bank_name, status)
values
  (
    'G-09',
    'MV135500',
    'FRENKENM',
    'MULTIVIA',
    'https://ebics.multivia-suite.de/ebicsweb/ebicsweb',
    'Volksbank im Westen eG',
    'nicht_initialisiert'
  )
on conflict (gesellschaft_id) do update set
  partner_id = excluded.partner_id,
  user_id = excluded.user_id,
  host_id = excluded.host_id,
  url = excluded.url,
  bank_name = excluded.bank_name,
  updated_at = now();

insert into public.ebics_konten (ebics_kunde_id, iban, bic, aktiv)
select k.id, v.iban, 'GENODED1WUR', true
from public.ebics_kunden k
join (
  values
    ('DE62370694123306926011'),
    ('DE03370694123311239014'),
    ('DE09370694123008834228'),
    ('DE37370694123008834015')
) as v(iban) on true
where k.gesellschaft_id = 'G-09'
on conflict (iban) do update set
  ebics_kunde_id = excluded.ebics_kunde_id,
  bic = excluded.bic,
  aktiv = excluded.aktiv;

insert into public.bankkonten (iban, gesellschaft_id, bank, bezeichnung, zugang, aktiv)
values
  (
    'DE62370694123306926011',
    'G-09',
    'Volksbank im Westen eG',
    null,
    'ebics',
    true
  ),
  (
    'DE03370694123311239014',
    'G-09',
    'Volksbank im Westen eG',
    null,
    'ebics',
    true
  ),
  (
    'DE09370694123008834228',
    'G-09',
    'Volksbank im Westen eG',
    null,
    'ebics',
    true
  ),
  (
    'DE37370694123008834015',
    'G-09',
    'Volksbank im Westen eG',
    null,
    'ebics',
    true
  )
on conflict (iban) do update set
  gesellschaft_id = excluded.gesellschaft_id,
  bank = excluded.bank,
  zugang = excluded.zugang,
  aktiv = excluded.aktiv,
  updated_at = now();

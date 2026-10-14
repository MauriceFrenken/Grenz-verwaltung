-- MV135500: Konten den richtigen Gesellschaften zuordnen (ein EBICS-Kunde, mehrere Firmen).
-- Technischer Anker bleibt G-09 (unique gesellschaft_id / partner_id).
-- Abruf-Zuordnung läuft über bankkonten.iban → gesellschaft_id.

update public.bankkonten set
  gesellschaft_id = 'G-08',
  bezeichnung = 'IPS',
  bank = 'Volksbank im Westen eG',
  zugang = 'ebics',
  aktiv = true,
  updated_at = now()
where iban = 'DE62370694123306926011';

update public.bankkonten set
  gesellschaft_id = 'G-09',
  bezeichnung = 'FB',
  bank = 'Volksbank im Westen eG',
  zugang = 'ebics',
  aktiv = true,
  updated_at = now()
where iban = 'DE03370694123311239014';

update public.bankkonten set
  gesellschaft_id = 'G-07',
  bezeichnung = 'Kreditkonto',
  bank = 'Volksbank im Westen eG',
  zugang = 'ebics',
  aktiv = true,
  updated_at = now()
where iban = 'DE09370694123008834228';

update public.bankkonten set
  gesellschaft_id = 'G-07',
  bezeichnung = 'Girokonto',
  bank = 'Volksbank im Westen eG',
  zugang = 'ebics',
  aktiv = true,
  updated_at = now()
where iban = 'DE37370694123008834015';

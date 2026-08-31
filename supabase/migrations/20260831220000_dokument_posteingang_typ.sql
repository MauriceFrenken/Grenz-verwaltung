-- Dokument-Typ: rechnung | dokument | expose (KI-Klassifikation)

alter table public.dokument_posteingang
  add column if not exists dokument_typ text
    check (dokument_typ in ('rechnung', 'dokument', 'expose'));

update public.dokument_posteingang
set dokument_typ = case
  when ist_rechnung is true then 'rechnung'
  when status in ('analysiert', 'abgelegt', 'gebucht') then 'dokument'
  else null
end
where dokument_typ is null;

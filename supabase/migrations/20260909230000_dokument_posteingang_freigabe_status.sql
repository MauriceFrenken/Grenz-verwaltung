-- Rechnungsfreigabe-Kanban: eigener Status neben posteingang.status

alter table public.dokument_posteingang
  add column if not exists freigabe_status text
    check (
      freigabe_status is null
      or freigabe_status in (
        'neu',
        'in_pruefung',
        'freigegeben',
        'an_datev',
        'erledigt'
      )
    );

alter table public.dokument_posteingang
  add column if not exists ablage_dateiname text;

-- Bestehende Rechnungen: offen → neu, gebucht → erledigt
update public.dokument_posteingang
set freigabe_status = case
  when status = 'gebucht' then 'erledigt'
  when dokument_typ = 'rechnung' or ist_rechnung = true then 'neu'
  else null
end
where freigabe_status is null
  and (dokument_typ = 'rechnung' or ist_rechnung = true or status = 'gebucht');

create index if not exists dokument_posteingang_freigabe_status_idx
  on public.dokument_posteingang (freigabe_status, eingegangen_am desc)
  where freigabe_status is not null;

-- Claim-Status für parallele KI-Analyse (ohne Doppelverarbeitung).

alter table public.dokument_posteingang
  drop constraint if exists dokument_posteingang_status_check;

alter table public.dokument_posteingang
  add constraint dokument_posteingang_status_check
  check (
    status in (
      'neu',
      'in_analyse',
      'analysiert',
      'fehler',
      'abgelegt',
      'gebucht'
    )
  );

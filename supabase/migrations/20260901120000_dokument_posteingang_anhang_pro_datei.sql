-- Pro Mail-Anhang ein eigener Postfach-Eintrag (statt nur primärer Anhang).

drop index if exists public.dokument_posteingang_nachricht_idx;

create unique index if not exists dokument_posteingang_nachricht_anhang_idx
  on public.dokument_posteingang (postfach, graph_nachricht_id, anhang_id);

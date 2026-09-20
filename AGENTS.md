## Agenten-Hinweise

Clientseitig gibt es **kein** Rollen-/Rechte-Matrix-System mehr. Alle authentifizierten Benutzer sehen dieselben Seiten und Aktionen. Rollen existieren nur noch als Benutzer-Attribut (Anzeige / Einladen), nicht als UI-Zugriffskontrolle.

**Git / Vercel:** Commits und Pushes auf `main` immer mit Author **und** Committer `BitBenByte <233641966+BitBenByte@users.noreply.github.com>` (sonst blockiert Vercel Deployment). Env für den Commit setzen, nicht `git config` ändern:

```bash
GIT_AUTHOR_NAME="BitBenByte" \
GIT_AUTHOR_EMAIL="233641966+BitBenByte@users.noreply.github.com" \
GIT_COMMITTER_NAME="BitBenByte" \
GIT_COMMITTER_EMAIL="233641966+BitBenByte@users.noreply.github.com" \
git commit ...
```

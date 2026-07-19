## Berechtigungssystem

Rollenbasierter Zugriff auf **Seiten** (Navigation/Routen) und **Aktionen** (Buttons). Konfiguration unter Einstellungen › Rollen & Rechte; Code-Registry unter `src/lib/permissions/`.

### Rollen-Hierarchie (Rang — niedriger = höhere Stufe)

| Rang | Rolle | Matrix editierbar? |
|------|-------|-------------------|
| 0 | `op_admin` | Nein — voller Zugriff, systemseitig |
| 1 | `administrator` | Ja |
| 2 | `manager` | Ja (nur Rollen mit Rang > 2) |
| 3 | `mitarbeiter` | Ja (durch höhere Rollen) |
| 4 | `leser` | Ja (durch höhere Rollen) |

Bearbeitungsregel: Ein User darf nur Rollen bearbeiten, deren Rang **strikt größer** ist als der eigene (nur nach unten). Beispiel: Manager bearbeitet `mitarbeiter` und `leser`, nicht `administrator`.

### Neue Seite hinzufügen

1. Eintrag in [`src/lib/permissions/registry.ts`](src/lib/permissions/registry.ts) unter `SEITEN_BERECHTIGUNGEN` (`id`, `pfad`, `label`, `gruppe`)
2. Default in [`src/lib/permissions/defaults.ts`](src/lib/permissions/defaults.ts) für jede konfigurierbare Rolle setzen
3. Sidebar-Item in [`src/components/layout/Sidebar.tsx`](src/components/layout/Sidebar.tsx) mit `berechtigung: SeitenBerechtigungId`
4. Route-Guard: `beforeLoad: seitenGuard("seite....")` in der Route-Datei unter `src/routes/`

### Neuen Button / Aktion hinzufügen

1. Eintrag in `AKTIONS_BERECHTIGUNGEN` in `registry.ts` (`id`, `label`, `seite`, `gruppe`)
2. Default in `defaults.ts` für relevante Rollen
3. Button mit `<PermissionGate berechtigung="aktion....">` wrappen ([`src/components/auth/PermissionGate.tsx`](src/components/auth/PermissionGate.tsx))
4. Optional: Eintrag auf der Rollen-Seite ist automatisch sichtbar (Registry-gesteuert)

### ID-Konvention

- Seiten: `seite.{bereich}.{name}` (z. B. `seite.verwaltung.objekte`)
- Aktionen: `aktion.{bereich}.{ressource}.{verb}` (z. B. `aktion.verwaltung.objekte.anlegen`)
- Labels auf Deutsch, IDs auf Englisch/kebab-case

### Regeln für Agenten

- **Niemals** `hatRolle("manager")` direkt in Feature-Code — immer Registry-ID + `usePermissions().darfAktion()` / `darfSeite()`
- **Immer** Registry + Default + Gate/Guard bei neuen UI-Elementen
- OP-Admin bypassed alle Checks in `hatBerechtigung()` — nicht in der Matrix konfigurierbar
- Matrix wird in Supabase (`rolle_berechtigungen`) gespeichert; Migration: `supabase/migrations/`
- **Git / Vercel:** Commits und Pushes auf `main` immer mit Author **und** Committer `BitBenByte <233641966+BitBenByte@users.noreply.github.com>` (sonst blockiert Vercel Deployment). Env für den Commit setzen, nicht `git config` ändern:

```bash
GIT_AUTHOR_NAME="BitBenByte" \
GIT_AUTHOR_EMAIL="233641966+BitBenByte@users.noreply.github.com" \
GIT_COMMITTER_NAME="BitBenByte" \
GIT_COMMITTER_EMAIL="233641966+BitBenByte@users.noreply.github.com" \
git commit ...
```

### PR-Checkliste (Seiten & Buttons)

- [ ] `registry.ts` — Seite und/oder Aktion registriert
- [ ] `defaults.ts` — sinnvolle Startwerte pro Rolle
- [ ] Sidebar + Route-Guard (Seiten) oder `PermissionGate` (Aktionen)
- [ ] Keine hardcodierten Rollen-Checks in Feature-Code

# Ablage v2 – Messbericht (Testset, Mock-KI)

Erzeugt mit `npm run ablage:messen`. Klassifikator: mock-heuristik-1. Schwelle für automatische Ablage: 90 %.
Treffer = Gesellschaft **und** Ordner stimmen mit der Erwartung überein. Fehlablage = falsch **und** ohne Prüfung abgelegt.

- Mails: 30
- Trefferquote gesamt: 97 % (29/30)
- Automatisch abgelegt: 19, davon richtig: 100 %
- Prüfliste: 11
- Fehlablagen ohne Prüfung: 0

### Trefferquote je Gesellschaft

| Gruppe | Mails | Treffer | Quote | automatisch | Fehlablagen |
|---|---:|---:|---:|---:|---:|
| (keine) | 1 | 1 | 100 % | 0 | 0 |
| GbR | 2 | 2 | 100 % | 1 | 0 |
| MB | 3 | 3 | 100 % | 3 | 0 |
| MBT | 1 | 1 | 100 % | 1 | 0 |
| MC | 1 | 1 | 100 % | 1 | 0 |
| MH | 3 | 3 | 100 % | 2 | 0 |
| MI | 9 | 9 | 100 % | 6 | 0 |
| MM | 1 | 1 | 100 % | 1 | 0 |
| MO | 3 | 3 | 100 % | 1 | 0 |
| MV | 6 | 5 | 83 % | 3 | 0 |

### Trefferquote je Ordner

| Gruppe | Mails | Treffer | Quote | automatisch | Fehlablagen |
|---|---:|---:|---:|---:|---:|
| Buchhaltung/Eingangsrechnungen | 5 | 5 | 100 % | 5 | 0 |
| Eingang/Zu klären | 1 | 1 | 100 % | 0 | 0 |
| Finanzen/Bank | 3 | 3 | 100 % | 3 | 0 |
| Finanzen/Darlehen/… | 4 | 4 | 100 % | 4 | 0 |
| Objekte/…/Kaufvertrag | 1 | 1 | 100 % | 0 | 0 |
| Objekte/…/Mietverträge | 4 | 4 | 100 % | 1 | 0 |
| Objekte/…/Nebenkosten | 1 | 1 | 100 % | 1 | 0 |
| Objekte/…/Rechnungen | 6 | 5 | 83 % | 2 | 0 |
| Objekte/…/Versicherungen | 1 | 1 | 100 % | 0 | 0 |
| Steuern | 2 | 2 | 100 % | 2 | 0 |
| Verträge | 1 | 1 | 100 % | 0 | 0 |
| Verträge/Versicherungen | 1 | 1 | 100 % | 1 | 0 |

### Einzelergebnisse

| Mail | Treffer | Weg | Konfidenz | Gesellschaft | Ordner (Vorschlag) | Erwartet (falls abweichend) |
|---|---|---|---:|---|---|---|
| M01 | ✓ | auto | 97 % | MI | Objekte/IM-2018-002/Rechnungen/2026 |  |
| M02 | ✓ | auto | 90 % | MI | Objekte/IM-2018-002/Rechnungen/2026 |  |
| M03 | ✓ | auto | 97 % | MI | Finanzen/Darlehen/DL-2018-002 |  |
| M04 | ✓ | auto | 90 % | MC | Finanzen/Bank/2026 |  |
| M05 | ✓ | Prüfliste | 79 % | MI | Objekte/IM-2018-002/Mietverträge |  |
| M06 | ✓ | Prüfliste | 88 % | MO | Objekte/IM-2016-001/Mietverträge |  |
| M07 | ✓ | auto | 97 % | GbR | Objekte/IM-2021-004/Nebenkosten |  |
| M08 | ✓ | Prüfliste | 89 % | MV | Objekte/IM-2025-006/Kaufvertrag |  |
| M09 | ✓ | auto | 93 % | MH | Steuern/2026 |  |
| M10 | ✓ | auto | 92 % | MB | Buchhaltung/Eingangsrechnungen/2026 |  |
| M11 | ✓ | Prüfliste | 89 % | MO | Objekte/IM-2016-001/Versicherungen |  |
| M12 | ✓ | auto | 97 % | MV | Finanzen/Darlehen/DL-2026-021 |  |
| M13 | ✓ | auto | 93 % | MBT | Buchhaltung/Eingangsrechnungen/2026 |  |
| M14 | ✗ | Prüfliste | 44 % | MO | Objekte/IM-2016-001/Rechnungen/2026 | MV · Objekte/IM-2025-006/Rechnungen/2026 |
| M15 | ✓ | auto | 91 % | MV | Finanzen/Bank/2026 |  |
| M16 | ✓ | auto | 97 % | MV | Finanzen/Darlehen/DL-2020-024 |  |
| M17 | ✓ | Prüfliste | 89 % | MV | Objekte/IM-2024-005/Rechnungen/2026 |  |
| M18 | ✓ | auto | 92 % | MM | Buchhaltung/Eingangsrechnungen/2026 |  |
| M19 | ✓ | Prüfliste | 88 % | MI | Objekte/IM-2019-003/Mietverträge |  |
| M20 | ✓ | Prüfliste | 0 % | – | Eingang/Zu klären |  |
| M21 | ✓ | Prüfliste | 88 % | GbR | Objekte/IM-2021-004/Rechnungen/2026 |  |
| M22 | ✓ | auto | 97 % | MI | Objekte/IM-2018-002/Mietverträge |  |
| M23 | ✓ | auto | 91 % | MI | Steuern/2026 |  |
| M24 | ✓ | auto | 94 % | MB | Finanzen/Bank/2026 |  |
| M25 | ✓ | auto | 97 % | MO | Finanzen/Darlehen/DL-2020-009 |  |
| M26 | ✓ | auto | 91 % | MH | Buchhaltung/Eingangsrechnungen/2026 |  |
| M27 | ✓ | auto | 93 % | MB | Verträge/Versicherungen |  |
| M28 | ✓ | Prüfliste | 85 % | MI | Objekte/IM-2019-003/Rechnungen/2026 |  |
| M29 | ✓ | Prüfliste | 88 % | MH | Verträge |  |
| M30 | ✓ | auto | 91 % | MI | Buchhaltung/Eingangsrechnungen/2026 |  |

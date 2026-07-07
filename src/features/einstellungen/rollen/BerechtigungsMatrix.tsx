import {
  AKTIONS_BERECHTIGUNGEN,
  SEITEN_BERECHTIGUNGEN,
  type BerechtigungId,
  type KonfigurierbareRolle,
  type RolleBerechtigungenMap,
  type SeitenBerechtigungId,
} from "@/lib/permissions";
import { BerechtigungsGruppe } from "./BerechtigungsGruppe";

interface BerechtigungsMatrixProps {
  rolle: KonfigurierbareRolle;
  matrix: RolleBerechtigungenMap;
  readonly: boolean;
  vergebareBerechtigungen: Set<BerechtigungId>;
  onChange: (rolle: KonfigurierbareRolle, id: BerechtigungId, aktiv: boolean) => void;
}

function gruppiereSeitenMitAktionen() {
  const aktionenProSeite = new Map<SeitenBerechtigungId, Array<{ id: BerechtigungId; label: string }>>();

  for (const aktion of AKTIONS_BERECHTIGUNGEN) {
    const list = aktionenProSeite.get(aktion.seite) ?? [];
    list.push({ id: aktion.id, label: aktion.label });
    aktionenProSeite.set(aktion.seite, list);
  }

  const gruppen = new Map<
    string,
    Array<{ id: BerechtigungId; label: string; aktionen: Array<{ id: BerechtigungId; label: string }> }>
  >();

  for (const seite of SEITEN_BERECHTIGUNGEN) {
    const list = gruppen.get(seite.gruppe) ?? [];
    list.push({
      id: seite.id,
      label: seite.label,
      aktionen: aktionenProSeite.get(seite.id) ?? [],
    });
    gruppen.set(seite.gruppe, list);
  }

  return gruppen;
}

const SEITEN_MIT_AKTIONEN = gruppiereSeitenMitAktionen();

export function BerechtigungsMatrix({
  rolle,
  matrix,
  readonly,
  vergebareBerechtigungen,
  onChange,
}: BerechtigungsMatrixProps) {
  const werte = matrix[rolle] ?? {};

  const handleToggle = (id: BerechtigungId, aktiv: boolean) => {
    if (!readonly && (aktiv === false || vergebareBerechtigungen.has(id))) {
      onChange(rolle, id, aktiv);
    }
  };

  const istDeaktiviert = (id: BerechtigungId): boolean =>
    !readonly && !vergebareBerechtigungen.has(id);

  return (
    <div className="space-y-4">
      {[...SEITEN_MIT_AKTIONEN.entries()].map(([gruppe, seiten]) => (
        <BerechtigungsGruppe
          key={gruppe}
          titel={gruppe}
          seiten={seiten}
          werte={werte}
          readonly={readonly}
          onToggle={handleToggle}
          istDeaktiviert={istDeaktiviert}
        />
      ))}
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { PermissionGate } from "@/components/auth/PermissionGate";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { einstellungenApi } from "@/api/einstellungen";
import { usePermissions } from "@/hooks/useAuth";
import { rollenBezeichnung, rollenBeschreibung } from "@/lib/constants";
import { mandantZuweisungFuerRolle } from "@/lib/rollenMandant";
import {
  type BerechtigungId,
  type KonfigurierbareRolle,
  type RolleBerechtigungenMap,
  vergebareBerechtigungen,
} from "@/lib/permissions";
import { usePermissionsStore } from "@/store/permissions";
import type { MandantZuweisung, RollenDefinition } from "@/types";
import { BerechtigungsMatrix } from "./rollen/BerechtigungsMatrix";
import { RolleAnlegenForm } from "./rollen/RolleAnlegenForm";
import { RolleBeschreibungFeld } from "./rollen/RolleBeschreibungFeld";
import { RolleMandantZugriffFeld } from "./rollen/RolleMandantZugriffFeld";
import { RollenListe } from "./rollen/RollenListe";

export function RollenPage() {
  const {
    bearbeitbareRollen,
    darfRolleBearbeiten,
    darfRollenSeite,
    rollen,
    eigeneRolle,
    matrix: storeMatrix,
  } = usePermissions();
  const setStoreMatrix = usePermissionsStore((s) => s.setMatrix);
  const setRollen = usePermissionsStore((s) => s.setRollen);
  const rangMap = usePermissionsStore((s) => s.rangMap);
  const konfigurierbareRollenIds = usePermissionsStore((s) => s.konfigurierbareRollenIds);

  const editierbare = bearbeitbareRollen();
  const [ausgewaehlteRolle, setAusgewaehlteRolle] = useState<KonfigurierbareRolle>(
    editierbare[0] ?? "leser",
  );
  const [entwurf, setEntwurf] = useState<RolleBerechtigungenMap>(() =>
    structuredClone(storeMatrix),
  );
  const [speichert, setSpeichert] = useState(false);
  const [dialogOffen, setDialogOffen] = useState(false);
  const [beschreibungEntwuerfe, setBeschreibungEntwuerfe] = useState<Record<string, string>>({});
  const [mandantZuweisungEntwuerfe, setMandantZuweisungEntwuerfe] = useState<
    Record<string, MandantZuweisung>
  >({});

  useEffect(() => {
    setEntwurf(structuredClone(storeMatrix));
  }, [storeMatrix]);

  useEffect(() => {
    if (!editierbare.includes(ausgewaehlteRolle) && editierbare.length > 0) {
      setAusgewaehlteRolle(editierbare[0]);
    }
  }, [editierbare, ausgewaehlteRolle]);

  const readonly = !darfRolleBearbeiten(ausgewaehlteRolle);
  const gespeicherteBeschreibung = rollenBeschreibung(ausgewaehlteRolle, rollen);
  const gespeicherteMandantZuweisung = mandantZuweisungFuerRolle(ausgewaehlteRolle, rollen);
  const aktuelleBeschreibung =
    beschreibungEntwuerfe[ausgewaehlteRolle] ?? gespeicherteBeschreibung;
  const aktuelleMandantZuweisung =
    mandantZuweisungEntwuerfe[ausgewaehlteRolle] ?? gespeicherteMandantZuweisung;
  const beschreibungGeaendert = aktuelleBeschreibung !== gespeicherteBeschreibung;
  const mandantZuweisungGeaendert = aktuelleMandantZuweisung !== gespeicherteMandantZuweisung;
  const vergebare = useMemo(
    () => vergebareBerechtigungen(eigeneRolle, entwurf),
    [eigeneRolle, entwurf],
  );

  const hatAenderungen = useMemo(() => {
    for (const rolle of konfigurierbareRollenIds()) {
      const entwurfRolle = entwurf[rolle];
      const storeRolle = storeMatrix[rolle];
      if (!entwurfRolle || !storeRolle) continue;
      for (const id of Object.keys(entwurfRolle) as BerechtigungId[]) {
        if (entwurfRolle[id] !== storeRolle[id]) {
          return true;
        }
      }
    }
    return false;
  }, [entwurf, storeMatrix, konfigurierbareRollenIds]);

  const hatBeschreibungAenderungen = useMemo(() => {
    return rollen.some((rolle) => {
      const entwurf = beschreibungEntwuerfe[rolle.id];
      return entwurf !== undefined && entwurf !== rollenBeschreibung(rolle.id, rollen);
    });
  }, [beschreibungEntwuerfe, rollen]);

  const hatMandantZuweisungAenderungen = useMemo(() => {
    return rollen.some((rolle) => {
      const entwurf = mandantZuweisungEntwuerfe[rolle.id];
      return (
        entwurf !== undefined && entwurf !== mandantZuweisungFuerRolle(rolle.id, rollen)
      );
    });
  }, [mandantZuweisungEntwuerfe, rollen]);

  const rolleHatAenderungen = useMemo(() => {
    const entwurfRolle = entwurf[ausgewaehlteRolle];
    const storeRolle = storeMatrix[ausgewaehlteRolle];
    if (!entwurfRolle || !storeRolle) return false;
    for (const id of Object.keys(entwurfRolle) as BerechtigungId[]) {
      if (entwurfRolle[id] !== storeRolle[id]) {
        return true;
      }
    }
    return beschreibungGeaendert || mandantZuweisungGeaendert;
  }, [entwurf, storeMatrix, ausgewaehlteRolle, beschreibungGeaendert, mandantZuweisungGeaendert]);

  const handleChange = useCallback(
    (rolle: KonfigurierbareRolle, id: BerechtigungId, aktiv: boolean) => {
      if (aktiv && !vergebareBerechtigungen(eigeneRolle, entwurf).has(id)) {
        return;
      }
      setEntwurf((prev) => ({
        ...prev,
        [rolle]: { ...prev[rolle], [id]: aktiv },
      }));
    },
    [eigeneRolle, entwurf],
  );

  const speichern = async () => {
    if (readonly || !rolleHatAenderungen) return;
    setSpeichert(true);
    try {
      const berechtigungenGeaendert = (() => {
        const entwurfRolle = entwurf[ausgewaehlteRolle];
        const storeRolle = storeMatrix[ausgewaehlteRolle];
        if (!entwurfRolle || !storeRolle) return false;
        for (const id of Object.keys(entwurfRolle) as BerechtigungId[]) {
          if (entwurfRolle[id] !== storeRolle[id]) {
            return true;
          }
        }
        return false;
      })();

      if (berechtigungenGeaendert) {
        await einstellungenApi.saveRollenBerechtigungen(ausgewaehlteRolle, entwurf);
        setStoreMatrix(structuredClone(entwurf));
      }

      if (beschreibungGeaendert) {
        const aktualisiert = await einstellungenApi.updateRolleBeschreibung(
          ausgewaehlteRolle,
          aktuelleBeschreibung,
        );
        setRollen(
          rollen.map((rolle) => (rolle.id === aktualisiert.id ? aktualisiert : rolle)),
        );
        setBeschreibungEntwuerfe((prev) => {
          const next = { ...prev };
          delete next[ausgewaehlteRolle];
          return next;
        });
      }

      if (mandantZuweisungGeaendert) {
        const aktualisiert = await einstellungenApi.updateRolleMandantZuweisung(
          ausgewaehlteRolle,
          aktuelleMandantZuweisung,
        );
        setRollen(
          rollen.map((rolle) => (rolle.id === aktualisiert.id ? aktualisiert : rolle)),
        );
        setMandantZuweisungEntwuerfe((prev) => {
          const next = { ...prev };
          delete next[ausgewaehlteRolle];
          return next;
        });
      }

      toast.success(`Rechte für ${rollenBezeichnung(ausgewaehlteRolle, rollen)} gespeichert`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    } finally {
      setSpeichert(false);
    }
  };

  const zuruecksetzen = () => {
    setEntwurf(structuredClone(storeMatrix));
    setBeschreibungEntwuerfe({});
    setMandantZuweisungEntwuerfe({});
  };

  const handleRolleAngelegt = (rolle: RollenDefinition) => {
    setDialogOffen(false);
    setAusgewaehlteRolle(rolle.id);
  };

  if (!darfRollenSeite()) {
    return (
      <>
        <PageHeader titel="Rollen & Rechte" />
        <PageWrapper>
          <p className="text-sm text-text-muted">Kein Zugriff.</p>
        </PageWrapper>
      </>
    );
  }

  return (
    <>
      <PageHeader
        titel="Rollen & Rechte"
        aktionen={
          <div className="flex gap-2">
            <PermissionGate berechtigung="aktion.einstellungen.rollen.anlegen">
              <Dialog open={dialogOffen} onOpenChange={setDialogOffen}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline">
                    <Plus className="mr-1.5 h-4 w-4" strokeWidth={1.5} />
                    Neue Rolle
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Neue Rolle anlegen</DialogTitle>
                  </DialogHeader>
                  <RolleAnlegenForm
                    onDone={handleRolleAngelegt}
                    onCancel={() => setDialogOffen(false)}
                  />
                </DialogContent>
              </Dialog>
            </PermissionGate>
            <Button
              size="sm"
              variant="outline"
              onClick={zuruecksetzen}
              disabled={(!hatAenderungen && !hatBeschreibungAenderungen && !hatMandantZuweisungAenderungen) || speichert}
            >
              Zurücksetzen
            </Button>
            <PermissionGate berechtigung="aktion.einstellungen.rollen.bearbeiten">
              <Button
                size="sm"
                className="bg-primary text-primary-foreground hover:bg-heading"
                onClick={speichern}
                disabled={readonly || !rolleHatAenderungen || speichert}
              >
                {speichert ? "Speichern…" : "Speichern"}
              </Button>
            </PermissionGate>
          </div>
        }
      />
      <PageWrapper>
        <div className="grid gap-6 lg:grid-cols-[minmax(240px,280px)_1fr]">
          <RollenListe
            ausgewaehlteRolle={ausgewaehlteRolle}
            onRolleWaehlen={setAusgewaehlteRolle}
            bearbeitbareRollen={editierbare}
            rollen={rollen}
            rangMap={rangMap()}
            beschreibungEntwuerfe={beschreibungEntwuerfe}
          />
          <div>
            <div className="mb-4 flex items-center justify-between gap-4">
              <div className="grid w-full gap-2">
                <h2 className="text-lg font-semibold text-heading">
                  {rollenBezeichnung(ausgewaehlteRolle, rollen)}
                </h2>
                <RolleBeschreibungFeld
                  value={aktuelleBeschreibung}
                  onChange={(value) =>
                    setBeschreibungEntwuerfe((prev) => ({
                      ...prev,
                      [ausgewaehlteRolle]: value,
                    }))
                  }
                  readonly={readonly}
                />
                <RolleMandantZugriffFeld
                  value={aktuelleMandantZuweisung}
                  onChange={(value) =>
                    setMandantZuweisungEntwuerfe((prev) => ({
                      ...prev,
                      [ausgewaehlteRolle]: value,
                    }))
                  }
                  readonly={readonly}
                />
                {readonly ? (
                  <p className="text-xs text-text-subtle">Nur Ansicht.</p>
                ) : null}
              </div>
            </div>
            <BerechtigungsMatrix
              rolle={ausgewaehlteRolle}
              matrix={entwurf}
              readonly={readonly}
              vergebareBerechtigungen={vergebare}
              onChange={handleChange}
            />
          </div>
        </div>
      </PageWrapper>
    </>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useForm, Controller, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { einstellungenApi } from "@/api/einstellungen";
import { verwaltungApi } from "@/api/verwaltung";
import { useApi } from "@/hooks/useApi";
import { usePermissions } from "@/hooks/useAuth";
import { useAktionGuard } from "@/hooks/useAktionGuard";
import { gesellschaftIdsAusBenutzer } from "@/lib/auth";
import { apiFehlermeldung } from "@/lib/apiFehlermeldung";
import { rollenBezeichnung } from "@/lib/constants";
import { SYSTEM_KONFIGURIERBARE_ROLLEN } from "@/lib/permissions";
import { gesellschaftZuweisungFuerRolle } from "@/lib/rollenGesellschaft";
import type { Benutzer, EinladungsRolle, Gesellschaft, RollenDefinition } from "@/types";

type GesellschaftOption = Pick<Gesellschaft, "id" | "name" | "kuerzel">;

function schemaFuerRollen(
  zuweisbareRollen: EinladungsRolle[],
  rollen: RollenDefinition[],
  istBearbeitung: boolean,
) {
  return z
    .object({
      name: z.string().trim().min(2, "Bitte Namen angeben"),
      stellenbezeichnung: z.string().trim().min(1, "Bitte Stellenbezeichnung angeben"),
      rolle: z
        .string()
        .refine((value): value is EinladungsRolle => zuweisbareRollen.includes(value), {
          message: "Bitte Rolle wählen",
        }),
      email: istBearbeitung
        ? z.string().optional()
        : z.string().trim().email("Bitte gültige E-Mail angeben"),
      gesellschaftModus: z.enum(["alle", "bestimmte"]),
      gesellschaftIds: z.array(z.string()),
    })
    .superRefine((data, ctx) => {
      const zuweisung = gesellschaftZuweisungFuerRolle(data.rolle, rollen);
      if (zuweisung === "alle" && data.gesellschaftModus === "alle") return;

      const gewaehlt = data.gesellschaftIds.filter(Boolean);
      if (gewaehlt.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Bitte mindestens eine Gesellschaft auswählen",
          path: ["gesellschaftIds", 0],
        });
        return;
      }

      if (zuweisung === "einzeln" && gewaehlt.length !== 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Für diese Rolle ist nur eine Gesellschaft erlaubt",
          path: ["gesellschaftIds"],
        });
        return;
      }

      const eindeutig = new Set(gewaehlt);
      if (eindeutig.size !== gewaehlt.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Jede Gesellschaft darf nur einmal zugewiesen werden",
          path: ["gesellschaftIds"],
        });
      }
    });
}

type FormValues = z.infer<ReturnType<typeof schemaFuerRollen>>;

function defaultWerteFuerBenutzer(benutzer: Benutzer): Pick<FormValues, "gesellschaftModus" | "gesellschaftIds"> {
  const zugriff = gesellschaftIdsAusBenutzer(benutzer);
  if (zugriff === "*") {
    return { gesellschaftModus: "alle", gesellschaftIds: [""] };
  }
  return {
    gesellschaftModus: "bestimmte",
    gesellschaftIds: zugriff.length > 0 ? zugriff : [""],
  };
}

function selectWert<T extends string>(wert: string | undefined, optionen: readonly T[]): T | undefined {
  return wert && optionen.includes(wert as T) ? (wert as T) : undefined;
}

function rollenMitAktueller(
  basis: EinladungsRolle[],
  aktuelleRolle: string | undefined,
  istOpAdmin: boolean,
): EinladungsRolle[] {
  let optionen = basis.length > 0 ? basis : [...SYSTEM_KONFIGURIERBARE_ROLLEN];
  if (istOpAdmin) {
    optionen = ["op_admin", ...optionen.filter((rolle) => rolle !== "op_admin")];
  }
  if (aktuelleRolle && !optionen.includes(aktuelleRolle)) {
    optionen = [...optionen, aktuelleRolle];
  }
  return optionen;
}

export function BenutzerForm({
  benutzer,
  onDone,
  onLoeschenAnfragen,
}: {
  benutzer?: Benutzer;
  onDone: () => void;
  onLoeschenAnfragen?: () => void;
}) {
  const istBearbeitung = Boolean(benutzer);
  const { zuweisbareRollen, rollen, istOpAdmin, permissionsLoading, eigeneRolle } = usePermissions();
  const { erlaubtOderHinweis } = useAktionGuard();
  const bisherigeRolle = benutzer?.rollen[0]?.rolle;
  const opAdmin = eigeneRolle === "op_admin";
  const zuweisbare = useMemo(
    () => rollenMitAktueller(zuweisbareRollen(), bisherigeRolle, opAdmin),
    [eigeneRolle, rollen, bisherigeRolle, opAdmin],
  );
  const zuweisbareSchluessel = zuweisbare.join("\0");
  const gesellschaften = useApi(() => verwaltungApi.listGesellschaften(), []);

  const schema = useMemo(
    () => schemaFuerRollen(zuweisbare, rollen, istBearbeitung),
    [zuweisbareSchluessel, rollen, istBearbeitung],
  );

  const defaultRolle =
    bisherigeRolle && zuweisbare.includes(bisherigeRolle)
      ? bisherigeRolle
      : (zuweisbare[zuweisbare.length - 1] ?? "leser");
  const gesellschaftDefaults = benutzer
    ? defaultWerteFuerBenutzer(benutzer)
    : {
        gesellschaftModus:
          gesellschaftZuweisungFuerRolle(defaultRolle, rollen) === "alle" ? ("alle" as const) : ("bestimmte" as const),
        gesellschaftIds: [""],
      };

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: benutzer?.name ?? "",
      stellenbezeichnung: benutzer?.stellenbezeichnung ?? "",
      rolle: defaultRolle,
      email: benutzer?.email ?? "",
      gesellschaftModus: gesellschaftDefaults.gesellschaftModus,
      gesellschaftIds: gesellschaftDefaults.gesellschaftIds,
    },
  });

  useEffect(() => {
    if (!benutzer) return;
    const gesellschaftWerte = defaultWerteFuerBenutzer(benutzer);
    const rolle =
      bisherigeRolle && zuweisbare.includes(bisherigeRolle)
        ? bisherigeRolle
        : (zuweisbare[zuweisbare.length - 1] ?? "leser");
    form.reset({
      name: benutzer.name,
      stellenbezeichnung: benutzer.stellenbezeichnung,
      rolle,
      email: benutzer.email,
      gesellschaftModus: gesellschaftWerte.gesellschaftModus,
      gesellschaftIds: gesellschaftWerte.gesellschaftIds,
    });
  }, [benutzer, bisherigeRolle, zuweisbareSchluessel, form]);

  const gewaehlteRolle = form.watch("rolle");
  const gesellschaftModus = form.watch("gesellschaftModus");
  const gesellschaftIds = form.watch("gesellschaftIds") ?? [];
  const gesellschaftZuweisung = useMemo(
    () => gesellschaftZuweisungFuerRolle(gewaehlteRolle, rollen),
    [gewaehlteRolle, rollen],
  );
  const darfAlleGesellschaften = gesellschaftZuweisung === "alle";
  const darfMehrereGesellschaftenZuweisen = gesellschaftZuweisung !== "einzeln";
  const gesellschaftenListe = gesellschaften.data?.items ?? [];
  const hatGesellschaften = gesellschaftenListe.length > 0;

  const gesellschaftStateFuerRolle = (rolle: string) => {
    const zuweisung = gesellschaftZuweisungFuerRolle(rolle, rollen);
    if (zuweisung === "alle") {
      return { gesellschaftModus: "alle" as const, gesellschaftIds: [""] };
    }
    const bestehend = form.getValues("gesellschaftIds").filter(Boolean);
    if (zuweisung === "einzeln") {
      const auto =
        gesellschaftenListe.length === 1
          ? gesellschaftenListe[0].id
          : bestehend.length > 0
            ? bestehend[0]
            : "";
      return { gesellschaftModus: "bestimmte" as const, gesellschaftIds: [auto] };
    }
    return {
      gesellschaftModus: "bestimmte" as const,
      gesellschaftIds: bestehend.length > 0 ? bestehend : [""],
    };
  };

  useEffect(() => {
    if (benutzer || rollen.length === 0) return;
    const rolle = form.getValues("rolle");
    const naechste = gesellschaftStateFuerRolle(rolle);
    if (form.getValues("gesellschaftModus") !== naechste.gesellschaftModus) {
      form.setValue("gesellschaftModus", naechste.gesellschaftModus);
    }
    if (form.getValues("gesellschaftIds").join() !== naechste.gesellschaftIds.join()) {
      form.setValue("gesellschaftIds", naechste.gesellschaftIds);
    }
  }, [benutzer, rollen, form, gesellschaftenListe]);

  useEffect(() => {
    if (darfAlleGesellschaften) return;
    const naechste = gesellschaftStateFuerRolle(gewaehlteRolle);
    if (form.getValues("gesellschaftModus") !== naechste.gesellschaftModus) {
      form.setValue("gesellschaftModus", naechste.gesellschaftModus);
    }
    if (form.getValues("gesellschaftIds").join() !== naechste.gesellschaftIds.join()) {
      form.setValue("gesellschaftIds", naechste.gesellschaftIds);
    }
  }, [darfAlleGesellschaften, gewaehlteRolle, gesellschaftZuweisung, form, rollen, gesellschaftenListe]);

  const [isResending, setIsResending] = useState(false);

  const onResend = async () => {
    if (!benutzer) return;
    const berechtigung = "aktion.einstellungen.benutzer.einladen";
    if (!istOpAdmin() && !erlaubtOderHinweis(berechtigung)) return;

    setIsResending(true);
    try {
      await einstellungenApi.resendEinladung(benutzer.email);
      toast.success("Einladung erneut gesendet", {
        description: `${benutzer.email} erhält eine neue E-Mail mit einem frischen Link (gültig ca. 1 Stunde).`,
      });
    } catch (err) {
      toast.error(apiFehlermeldung(err));
    } finally {
      setIsResending(false);
    }
  };

  const ersteFehlermeldung = (errors: FieldErrors<FormValues>): string | undefined => {
    for (const value of Object.values(errors)) {
      if (!value) continue;
      if (typeof value === "object" && "message" in value && typeof value.message === "string") {
        return value.message;
      }
      if (Array.isArray(value)) {
        for (const eintrag of value) {
          if (eintrag && typeof eintrag.message === "string") return eintrag.message;
        }
      }
    }
    return undefined;
  };

  const onInvalid = (errors: FieldErrors<FormValues>) => {
    toast.error(ersteFehlermeldung(errors) ?? "Bitte alle Pflichtfelder ausfüllen");
  };

  const onSubmit = async (values: FormValues) => {
    const berechtigung = istBearbeitung
      ? "aktion.einstellungen.benutzer.bearbeiten"
      : "aktion.einstellungen.benutzer.einladen";
    if (!istOpAdmin() && !erlaubtOderHinweis(berechtigung)) return;

    try {
      const zuweisung = gesellschaftZuweisungFuerRolle(values.rolle, rollen);
      const gesellschaftZugriff =
        zuweisung === "alle" && values.gesellschaftModus === "alle"
          ? ("*" as const)
          : [...new Set(values.gesellschaftIds.filter(Boolean))];

      if (istBearbeitung && benutzer) {
        await einstellungenApi.updateBenutzer({
          id: benutzer.id,
          name: values.name,
          stellenbezeichnung: values.stellenbezeichnung,
          rolle: values.rolle,
          gesellschaftZugriff,
        });
        toast.success("Benutzer aktualisiert");
      } else {
        await einstellungenApi.inviteBenutzer({
          name: values.name,
          stellenbezeichnung: values.stellenbezeichnung,
          rolle: values.rolle,
          email: values.email ?? "",
          gesellschaftZugriff,
        });
        toast.success("Einladung gesendet", {
          description: `${values.email} erhält eine E-Mail zum Festlegen des Passworts.`,
        });
      }
      onDone();
    } catch (err) {
      toast.error(apiFehlermeldung(err));
    }
  };

  const gesellschaftFehler = (index: number) => {
    const root = form.formState.errors.gesellschaftIds;
    if (!root) return undefined;
    if (Array.isArray(root)) return root[index]?.message;
    if (typeof root === "object" && "message" in root) return root.message as string;
    return undefined;
  };

  if (zuweisbare.length === 0) {
    return (
      <p className="text-sm text-text-muted">
        {permissionsLoading ? "Rollen werden geladen…" : "Ihre Rolle erlaubt keine Zuweisung weiterer Benutzerrollen."}
      </p>
    );
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="grid w-full min-w-0 gap-4">
      <div className="grid gap-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" autoComplete="name" {...form.register("name")} />
        {form.formState.errors.name ? (
          <p className="text-xs text-danger">{form.formState.errors.name.message}</p>
        ) : null}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="stellenbezeichnung">Stellenbezeichnung</Label>
        <Input
          id="stellenbezeichnung"
          placeholder="z. B. Objektmanager"
          {...form.register("stellenbezeichnung")}
        />
        {form.formState.errors.stellenbezeichnung ? (
          <p className="text-xs text-danger">{form.formState.errors.stellenbezeichnung.message}</p>
        ) : null}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="rolle">Rolle</Label>
        <Controller
          control={form.control}
          name="rolle"
          render={({ field }) => (
            <Select
              value={selectWert(field.value, zuweisbare)}
              onValueChange={(rolle) => {
                field.onChange(rolle);
                const naechste = gesellschaftStateFuerRolle(rolle);
                form.setValue("gesellschaftModus", naechste.gesellschaftModus);
                form.setValue("gesellschaftIds", naechste.gesellschaftIds);
              }}
            >
              <SelectTrigger id="rolle" className="rounded-none">
                <SelectValue placeholder="Rolle wählen" />
              </SelectTrigger>
              <SelectContent>
                {zuweisbare.map((rolle) => (
                  <SelectItem key={rolle} value={rolle}>
                    {rollenBezeichnung(rolle, rollen)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {form.formState.errors.rolle ? (
          <p className="text-xs text-danger">{form.formState.errors.rolle.message}</p>
        ) : null}
      </div>

      <div className="grid gap-3">
        <Label>Gesellschaftszugriff</Label>
        {darfAlleGesellschaften ? (
          <Controller
            control={form.control}
            name="gesellschaftModus"
            render={({ field }) => (
              <RadioGroup
                value={field.value}
                onValueChange={(value) => {
                  field.onChange(value);
                  if (value === "bestimmte" && form.getValues("gesellschaftIds").length === 0) {
                    form.setValue("gesellschaftIds", [""]);
                  }
                }}
                className="gap-3"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="alle" id="gesellschaft-alle" />
                  <Label htmlFor="gesellschaft-alle" className="cursor-pointer font-normal">
                    Alle Gesellschaften
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="bestimmte" id="gesellschaft-bestimmte" disabled={!hatGesellschaften} />
                  <Label
                    htmlFor="gesellschaft-bestimmte"
                    className={`font-normal ${hatGesellschaften ? "cursor-pointer" : "text-text-subtle"}`}
                  >
                    Bestimmte Gesellschaften
                  </Label>
                </div>
              </RadioGroup>
            )}
          />
        ) : (
          <p className="text-xs text-text-muted">
            {gesellschaftZuweisung === "einzeln"
              ? "Genau eine Gesellschaft erforderlich."
              : "Nur bestimmte Gesellschaften möglich."}
          </p>
        )}
        {!hatGesellschaften ? (
          <p className="text-xs text-text-muted">Noch keine Gesellschaften angelegt.</p>
        ) : null}
        {(gesellschaftModus === "bestimmte" || !darfAlleGesellschaften) && hatGesellschaften ? (
          <div className="grid gap-2 pl-6">
            {gesellschaftIds.map((_, index) => {
              const andere = gesellschaftIds.filter((_, i) => i !== index);
              const verfuegbar: GesellschaftOption[] = gesellschaftenListe
                .filter((m) => !andere.includes(m.id))
                .map((m) => ({ id: m.id, name: m.name, kuerzel: m.kuerzel }));
              const gewaehlteId = gesellschaftIds[index];
              // Entfernte Gesellschaft bleibt wählbar, damit die Zuweisung nicht still verloren geht.
              const gesellschaftOptionen =
                gewaehlteId && !verfuegbar.some((m) => m.id === gewaehlteId)
                  ? [...verfuegbar, { id: gewaehlteId, name: gewaehlteId, kuerzel: gewaehlteId }]
                  : verfuegbar;

              return (
                <div key={index} className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <Controller
                      control={form.control}
                      name={`gesellschaftIds.${index}`}
                      render={({ field }) => (
                        <Select
                          value={selectWert(
                            field.value,
                            gesellschaftOptionen.map((m) => m.id),
                          )}
                          onValueChange={field.onChange}
                        >
                          <SelectTrigger className="rounded-none">
                            <SelectValue placeholder="Gesellschaft wählen" />
                          </SelectTrigger>
                          <SelectContent>
                            {gesellschaftOptionen.map((m) => (
                              <SelectItem key={m.id} value={m.id}>
                                {`${m.name} (${m.kuerzel})`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    {gesellschaftFehler(index) ? (
                      <p className="mt-1 text-xs text-danger">{gesellschaftFehler(index)}</p>
                    ) : null}
                  </div>
                  {index > 0 && darfMehrereGesellschaftenZuweisen ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="shrink-0 text-text-muted hover:text-danger"
                      onClick={() => {
                        const next = gesellschaftIds.filter((__, i) => i !== index);
                        form.setValue("gesellschaftIds", next.length > 0 ? next : [""]);
                      }}
                      aria-label="Gesellschaft entfernen"
                    >
                      <X className="h-4 w-4" strokeWidth={1.5} />
                    </Button>
                  ) : (
                    <div className="w-9 shrink-0" />
                  )}
                </div>
              );
            })}
            {darfMehrereGesellschaftenZuweisen && gesellschaftIds.length < gesellschaftenListe.length ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-fit"
                onClick={() => form.setValue("gesellschaftIds", [...gesellschaftIds, ""])}
              >
                <Plus className="mr-2 h-4 w-4" strokeWidth={1.5} />
                Weitere Gesellschaft zuweisen
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="email">E-Mail</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="name@firma.de"
          readOnly={istBearbeitung}
          className={istBearbeitung ? "bg-muted text-text-muted" : undefined}
          {...form.register("email")}
        />
        {istBearbeitung ? (
          <p className="text-xs text-text-muted">Die E-Mail-Adresse kann nicht geändert werden.</p>
        ) : null}
        {form.formState.errors.email ? (
          <p className="text-xs text-danger">{form.formState.errors.email.message}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 border-t border-hairline pt-4">
        {istBearbeitung && (onLoeschenAnfragen || benutzer) ? (
          <div className="flex flex-wrap gap-2">
            {onLoeschenAnfragen ? (
              <Button type="button" variant="destructive" onClick={onLoeschenAnfragen}>
                Löschen
              </Button>
            ) : null}
            {benutzer ? (
              <Button
                type="button"
                variant="outline"
                onClick={onResend}
                disabled={isResending || form.formState.isSubmitting}
              >
                {isResending ? "Wird gesendet…" : "Einladung erneut senden"}
              </Button>
            ) : null}
          </div>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={onDone} disabled={form.formState.isSubmitting || isResending}>
            Abbrechen
          </Button>
          <Button
            type="submit"
            disabled={form.formState.isSubmitting || isResending}
            className="bg-primary text-primary-foreground hover:bg-heading"
          >
            {form.formState.isSubmitting
              ? istBearbeitung
                ? "Wird gespeichert…"
                : "Wird gesendet…"
              : istBearbeitung
                ? "Speichern"
                : "Einladung senden"}
          </Button>
        </div>
      </div>
    </form>
  );
}

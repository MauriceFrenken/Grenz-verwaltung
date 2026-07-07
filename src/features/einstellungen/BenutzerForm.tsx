import { useEffect, useMemo } from "react";
import { useForm, Controller } from "react-hook-form";
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
import { useApi } from "@/hooks/useApi";
import { usePermissions } from "@/hooks/useAuth";
import { useAktionGuard } from "@/hooks/useAktionGuard";
import { mandantIdsAusBenutzer } from "@/lib/auth";
import { apiFehlermeldung } from "@/lib/apiFehlermeldung";
import { rollenBezeichnung } from "@/lib/constants";
import { SYSTEM_KONFIGURIERBARE_ROLLEN } from "@/lib/permissions";
import { mandantZuweisungFuerRolle } from "@/lib/rollenMandant";
import type { Benutzer, EinladungsRolle, RollenDefinition } from "@/types";

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
      mandantModus: z.enum(["alle", "bestimmte"]),
      mandantIds: z.array(z.string()),
    })
    .superRefine((data, ctx) => {
      const zuweisung = mandantZuweisungFuerRolle(data.rolle, rollen);
      if (zuweisung === "alle" && data.mandantModus === "alle") return;

      const gewaehlt = data.mandantIds.filter(Boolean);
      if (gewaehlt.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Bitte mindestens einen Mandanten auswählen",
          path: ["mandantIds", 0],
        });
        return;
      }

      if (zuweisung === "einzeln" && gewaehlt.length !== 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Für diese Rolle ist nur ein Mandant erlaubt",
          path: ["mandantIds"],
        });
        return;
      }

      const eindeutig = new Set(gewaehlt);
      if (eindeutig.size !== gewaehlt.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Jeder Mandant darf nur einmal zugewiesen werden",
          path: ["mandantIds"],
        });
      }
    });
}

type FormValues = z.infer<ReturnType<typeof schemaFuerRollen>>;

function defaultWerteFuerBenutzer(benutzer: Benutzer): Pick<FormValues, "mandantModus" | "mandantIds"> {
  const zugriff = mandantIdsAusBenutzer(benutzer);
  if (zugriff === "*") {
    return { mandantModus: "alle", mandantIds: [""] };
  }
  return {
    mandantModus: "bestimmte",
    mandantIds: zugriff.length > 0 ? zugriff : [""],
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
  const mandanten = useApi(() => einstellungenApi.listMandanten(), []);

  const schema = useMemo(
    () => schemaFuerRollen(zuweisbare, rollen, istBearbeitung),
    [zuweisbareSchluessel, rollen, istBearbeitung],
  );

  const defaultRolle =
    bisherigeRolle && zuweisbare.includes(bisherigeRolle)
      ? bisherigeRolle
      : (zuweisbare[zuweisbare.length - 1] ?? "leser");
  const mandantDefaults = benutzer
    ? defaultWerteFuerBenutzer(benutzer)
    : {
        mandantModus:
          mandantZuweisungFuerRolle(defaultRolle, rollen) === "alle" ? ("alle" as const) : ("bestimmte" as const),
        mandantIds: [""],
      };

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: benutzer?.name ?? "",
      stellenbezeichnung: benutzer?.stellenbezeichnung ?? "",
      rolle: defaultRolle,
      email: benutzer?.email ?? "",
      mandantModus: mandantDefaults.mandantModus,
      mandantIds: mandantDefaults.mandantIds,
    },
  });

  useEffect(() => {
    if (!benutzer) return;
    const mandantWerte = defaultWerteFuerBenutzer(benutzer);
    const rolle =
      bisherigeRolle && zuweisbare.includes(bisherigeRolle)
        ? bisherigeRolle
        : (zuweisbare[zuweisbare.length - 1] ?? "leser");
    form.reset({
      name: benutzer.name,
      stellenbezeichnung: benutzer.stellenbezeichnung,
      rolle,
      email: benutzer.email,
      mandantModus: mandantWerte.mandantModus,
      mandantIds: mandantWerte.mandantIds,
    });
  }, [benutzer, bisherigeRolle, zuweisbareSchluessel, form]);

  const gewaehlteRolle = form.watch("rolle");
  const mandantModus = form.watch("mandantModus");
  const mandantIds = form.watch("mandantIds") ?? [];
  const mandantZuweisung = useMemo(
    () => mandantZuweisungFuerRolle(gewaehlteRolle, rollen),
    [gewaehlteRolle, rollen],
  );
  const darfAlleMandanten = mandantZuweisung === "alle";
  const darfMehrereMandantenZuweisen = mandantZuweisung !== "einzeln";
  const mandantenListe = mandanten.data?.items ?? [];
  const hatMandanten = mandantenListe.length > 0;

  useEffect(() => {
    if (darfAlleMandanten) return;
    const aktuellerModus = form.getValues("mandantModus");
    if (aktuellerModus !== "bestimmte") {
      form.setValue("mandantModus", "bestimmte");
    }
    const ids = form.getValues("mandantIds").filter(Boolean);
    if (mandantZuweisung === "einzeln") {
      const naechste = ids.length > 0 ? [ids[0]] : [""];
      if (form.getValues("mandantIds").join() !== naechste.join()) {
        form.setValue("mandantIds", naechste);
      }
    } else if (ids.length === 0) {
      form.setValue("mandantIds", [""]);
    }
  }, [darfAlleMandanten, mandantZuweisung, form]);

  const onSubmit = async (values: FormValues) => {
    const berechtigung = istBearbeitung
      ? "aktion.einstellungen.benutzer.bearbeiten"
      : "aktion.einstellungen.benutzer.einladen";
    if (!istOpAdmin() && !erlaubtOderHinweis(berechtigung)) return;

    try {
      const mandantZugriff =
        values.mandantModus === "alle"
          ? ("*" as const)
          : [...new Set(values.mandantIds.filter(Boolean))];

      if (istBearbeitung && benutzer) {
        await einstellungenApi.updateBenutzer({
          id: benutzer.id,
          name: values.name,
          stellenbezeichnung: values.stellenbezeichnung,
          rolle: values.rolle,
          mandantZugriff,
        });
        toast.success("Benutzer aktualisiert");
      } else {
        await einstellungenApi.inviteBenutzer({
          name: values.name,
          stellenbezeichnung: values.stellenbezeichnung,
          rolle: values.rolle,
          email: values.email ?? "",
          mandantZugriff,
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

  const mandantFehler = (index: number) => {
    const root = form.formState.errors.mandantIds;
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
    <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
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
              onValueChange={field.onChange}
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
        <Label>Mandantenzugriff</Label>
        {darfAlleMandanten ? (
          <Controller
            control={form.control}
            name="mandantModus"
            render={({ field }) => (
              <RadioGroup
                value={field.value}
                onValueChange={(value) => {
                  field.onChange(value);
                  if (value === "bestimmte" && form.getValues("mandantIds").length === 0) {
                    form.setValue("mandantIds", [""]);
                  }
                }}
                className="gap-3"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="alle" id="mandant-alle" />
                  <Label htmlFor="mandant-alle" className="cursor-pointer font-normal">
                    Alle Mandanten
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="bestimmte" id="mandant-bestimmte" disabled={!hatMandanten} />
                  <Label
                    htmlFor="mandant-bestimmte"
                    className={`font-normal ${hatMandanten ? "cursor-pointer" : "text-text-subtle"}`}
                  >
                    Bestimmte Mandanten
                  </Label>
                </div>
              </RadioGroup>
            )}
          />
        ) : (
          <p className="text-xs text-text-muted">
            {mandantZuweisung === "einzeln"
              ? "Genau ein Mandant erforderlich."
              : "Nur bestimmte Mandanten möglich."}
          </p>
        )}
        {!hatMandanten ? (
          <p className="text-xs text-text-muted">Noch keine Mandanten angelegt.</p>
        ) : null}
        {(mandantModus === "bestimmte" || !darfAlleMandanten) && hatMandanten ? (
          <div className="grid gap-2 pl-6">
            {mandantIds.map((_, index) => {
              const andere = mandantIds.filter((_, i) => i !== index);
              const verfuegbar = mandantenListe.filter((m) => !andere.includes(m.id));
              const gewaehlteId = mandantIds[index];
              const mandantOptionen =
                gewaehlteId && !verfuegbar.some((m) => m.id === gewaehlteId)
                  ? [
                      ...verfuegbar,
                      {
                        id: gewaehlteId,
                        name: gewaehlteId,
                        kuerzel: gewaehlteId,
                        anzahlObjekte: 0,
                      },
                    ]
                  : verfuegbar;

              return (
                <div key={index} className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <Controller
                      control={form.control}
                      name={`mandantIds.${index}`}
                      render={({ field }) => (
                        <Select
                          value={selectWert(
                            field.value,
                            mandantOptionen.map((m) => m.id),
                          )}
                          onValueChange={field.onChange}
                        >
                          <SelectTrigger className="rounded-none">
                            <SelectValue placeholder="Mandant wählen" />
                          </SelectTrigger>
                          <SelectContent>
                            {mandantOptionen.map((m) => (
                              <SelectItem key={m.id} value={m.id}>
                                {`${m.name} (${m.kuerzel})`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    {mandantFehler(index) ? (
                      <p className="mt-1 text-xs text-danger">{mandantFehler(index)}</p>
                    ) : null}
                  </div>
                  {index > 0 && darfMehrereMandantenZuweisen ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="shrink-0 text-text-muted hover:text-danger"
                      onClick={() => {
                        const next = mandantIds.filter((__, i) => i !== index);
                        form.setValue("mandantIds", next.length > 0 ? next : [""]);
                      }}
                      aria-label="Mandant entfernen"
                    >
                      <X className="h-4 w-4" strokeWidth={1.5} />
                    </Button>
                  ) : (
                    <div className="w-9 shrink-0" />
                  )}
                </div>
              );
            })}
            {darfMehrereMandantenZuweisen && mandantIds.length < mandantenListe.length ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-fit"
                onClick={() => form.setValue("mandantIds", [...mandantIds, ""])}
              >
                <Plus className="mr-2 h-4 w-4" strokeWidth={1.5} />
                Weiteren Mandanten zuweisen
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

      <div className="flex justify-between gap-2 pt-2">
        <div>
          {istBearbeitung && onLoeschenAnfragen ? (
            <Button type="button" variant="destructive" onClick={onLoeschenAnfragen}>
              Löschen
            </Button>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onDone} disabled={form.formState.isSubmitting}>
            Abbrechen
          </Button>
          <Button
            type="submit"
            disabled={form.formState.isSubmitting}
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

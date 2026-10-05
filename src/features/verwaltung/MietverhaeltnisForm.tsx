import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { verwaltungApi } from "@/api/verwaltung";
import { apiFehlermeldung } from "@/lib/apiFehlermeldung";
import { STATUS_LABEL } from "@/lib/constants";
import type { Einheit, Mieter, Mietverhaeltnis, MietverhaeltnisStatus } from "@/types";
import { text } from "./format";

const STATUS: MietverhaeltnisStatus[] = [
  "aktiv",
  "gekuendigt",
  "beendet",
  "geplant",
];

const zahlFeld = z
  .string()
  .trim()
  .refine(
    (v) => v === "" || !Number.isNaN(Number(v.replace(",", "."))),
    "Bitte Zahl angeben",
  );

const schema = z.object({
  einheitId: z.string().trim().min(1, "Bitte Einheit wählen"),
  mieterId: z.string().trim().min(1, "Bitte Mieter wählen"),
  beginn: z.string(),
  ende: z.string(),
  letzteMieterhoehung: z.string(),
  kaltmiete: zahlFeld,
  nkVorauszahlung: zahlFeld,
  status: z.enum(["aktiv", "gekuendigt", "beendet", "geplant"]),
  bemerkung: z.string().trim(),
});

type FormValues = z.infer<typeof schema>;

function alsZahl(wert: string): number {
  const n = Number(wert.trim().replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function alsZahlOderNull(wert: string): number | null {
  const t = wert.trim();
  if (!t) return null;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function alsText(wert: number | null | undefined): string {
  return wert === null || wert === undefined ? "" : String(wert);
}

export function MietverhaeltnisForm({
  mietverhaeltnis,
  einheiten,
  mieter,
  vorauswahlEinheitId,
  formId = "mietverhaeltnis",
  onDone,
  onLoeschenAnfragen,
}: {
  mietverhaeltnis?: Mietverhaeltnis;
  einheiten: Einheit[];
  mieter: Mieter[];
  vorauswahlEinheitId?: string | null;
  formId?: string;
  onDone: () => void;
  onLoeschenAnfragen?: () => void;
}) {
  const istBearbeitung = Boolean(mietverhaeltnis);
  const [mitEnde, setMitEnde] = useState(Boolean(mietverhaeltnis?.ende));

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      einheitId: mietverhaeltnis?.einheitId ?? vorauswahlEinheitId ?? "",
      mieterId: mietverhaeltnis?.mieterId ?? "",
      beginn: mietverhaeltnis?.beginn ?? "",
      ende: mietverhaeltnis?.ende ?? "",
      letzteMieterhoehung: mietverhaeltnis?.letzteMieterhoehung ?? "",
      kaltmiete: alsText(mietverhaeltnis?.kaltmiete),
      nkVorauszahlung: alsText(mietverhaeltnis?.nkVorauszahlung),
      status: mietverhaeltnis?.status ?? "aktiv",
      bemerkung: mietverhaeltnis?.bemerkung ?? "",
    },
  });

  const gewaehlterMieterId = form.watch("mieterId");
  const gewaehlterMieter =
    mieter.find((m) => m.id === gewaehlterMieterId) ?? null;

  const onSubmit = async (values: FormValues) => {
    try {
      await verwaltungApi.saveMietverhaeltnis({
        id: mietverhaeltnis?.id,
        einheitId: values.einheitId,
        mieterId: values.mieterId,
        beginn: values.beginn || null,
        ende: values.ende || null,
        letzteMieterhoehung: values.letzteMieterhoehung || null,
        kaltmiete: alsZahl(values.kaltmiete),
        nkVorauszahlung: alsZahlOderNull(values.nkVorauszahlung),
        status: values.status,
        bemerkung: values.bemerkung,
      });
      toast.success(
        istBearbeitung
          ? "Mietverhältnis aktualisiert"
          : "Mietverhältnis angelegt",
      );
      onDone();
    } catch (err) {
      toast.error(apiFehlermeldung(err));
    }
  };

  const fehler = form.formState.errors;

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="grid w-full min-w-0 gap-4"
    >
      <div className="grid gap-2">
        <Label htmlFor="einheitId">Einheit</Label>
        <Controller
          control={form.control}
          name="einheitId"
          render={({ field }) => (
            <Select
              value={field.value || undefined}
              onValueChange={field.onChange}
            >
              <SelectTrigger id="einheitId" className="rounded-none">
                <SelectValue placeholder="Einheit wählen" />
              </SelectTrigger>
              <SelectContent>
                {einheiten.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {`${e.objektBezeichnung} — ${e.lage}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {fehler.einheitId ? (
          <p className="text-xs text-danger">{fehler.einheitId.message}</p>
        ) : null}
      </div>

      <div className="grid gap-2">
        <Label htmlFor={`${formId}-mieter`}>Mieter</Label>
        <Controller
          control={form.control}
          name="mieterId"
          render={({ field }) => (
            <Select
              value={field.value || undefined}
              onValueChange={field.onChange}
            >
              <SelectTrigger id={`${formId}-mieter`} className="rounded-none">
                <SelectValue placeholder="Mieter wählen" />
              </SelectTrigger>
              <SelectContent>
                {mieter.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.anzeigename}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {fehler.mieterId ? (
          <p className="text-xs text-danger">{fehler.mieterId.message}</p>
        ) : null}
        {gewaehlterMieter ? (
          <p className="text-xs text-text-muted">
            IBAN: {text(gewaehlterMieter.iban)}
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor={`${formId}-beginn`}>Vertragsbeginn</Label>
          <Input
            id={`${formId}-beginn`}
            type="date"
            autoComplete="off"
            {...form.register("beginn")}
          />
        </div>
        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor={`${formId}-mit-ende`}>Vertragsende</Label>
            <Switch
              id={`${formId}-mit-ende`}
              checked={mitEnde}
              onCheckedChange={(checked) => {
                setMitEnde(checked);
                if (!checked) form.setValue("ende", "");
              }}
            />
          </div>
          {mitEnde ? (
            <Input
              id={`${formId}-ende`}
              type="date"
              autoComplete="off"
              {...form.register("ende")}
            />
          ) : null}
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="letzteMieterhoehung">Letzte Mieterhöhung</Label>
        <Input
          id="letzteMieterhoehung"
          type="date"
          {...form.register("letzteMieterhoehung")}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="kaltmiete">Kaltmiete (EUR)</Label>
          <Input
            id="kaltmiete"
            inputMode="decimal"
            {...form.register("kaltmiete")}
          />
          {fehler.kaltmiete ? (
            <p className="text-xs text-danger">{fehler.kaltmiete.message}</p>
          ) : null}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="nkVorauszahlung">NK-Vorauszahlung (EUR)</Label>
          <Input
            id="nkVorauszahlung"
            inputMode="decimal"
            {...form.register("nkVorauszahlung")}
          />
          {fehler.nkVorauszahlung ? (
            <p className="text-xs text-danger">
              {fehler.nkVorauszahlung.message}
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="status">Status</Label>
          <Controller
            control={form.control}
            name="status"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="status" className="rounded-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABEL[s] ?? s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="bemerkung">Bemerkung</Label>
          <Input id="bemerkung" {...form.register("bemerkung")} />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-4">
        {onLoeschenAnfragen ? (
          <Button
            type="button"
            variant="destructive"
            onClick={onLoeschenAnfragen}
          >
            Löschen
          </Button>
        ) : (
          <span />
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onDone}
            disabled={form.formState.isSubmitting}
          >
            Abbrechen
          </Button>
          <Button
            type="submit"
            disabled={form.formState.isSubmitting}
            className="bg-primary text-primary-foreground hover:bg-heading"
          >
            {form.formState.isSubmitting ? "Wird gespeichert…" : "Speichern"}
          </Button>
        </div>
      </div>
    </form>
  );
}

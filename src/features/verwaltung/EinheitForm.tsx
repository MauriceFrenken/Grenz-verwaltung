import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { verwaltungApi } from "@/api/verwaltung";
import { apiFehlermeldung, istGueltigeSlugId } from "@/lib/apiFehlermeldung";
import { STATUS_LABEL } from "@/lib/constants";
import type {
  Einheit,
  EinheitNutzungsart,
  EinheitStatus,
  Objekt,
} from "@/types";
import { NUTZUNGSART_LABEL } from "./format";

const NUTZUNGSARTEN: EinheitNutzungsart[] = [
  "wohnen",
  "gewerbe",
  "garage",
  "stellplatz",
  "sonstiges",
];
const STATUS: EinheitStatus[] = [
  "vermietet",
  "leerstand",
  "wartung",
  "reserviert",
];

/** Leerstring aus dem Zahlenfeld wird zu null, nicht zu 0. */
const zahlFeld = z
  .string()
  .trim()
  .refine(
    (v) => v === "" || !Number.isNaN(Number(v.replace(",", "."))),
    "Bitte Zahl angeben",
  );

const schema = z.object({
  id: z
    .string()
    .trim()
    .min(2, "Bitte ID angeben")
    .refine(
      (v) => istGueltigeSlugId(v, "objekt"),
      "Nur Buchstaben, Zahlen, Bindestrich und Unterstrich",
    ),
  objektId: z.string().trim().min(1, "Bitte Objekt wählen"),
  hausteil: z.string().trim(),
  lage: z.string().trim().min(1, "Bitte Lage angeben"),
  nutzungsart: z.enum([
    "wohnen",
    "gewerbe",
    "garage",
    "stellplatz",
    "sonstiges",
  ]),
  status: z.enum(["vermietet", "leerstand", "wartung", "reserviert"]),
  flaecheM2: zahlFeld,
  flaecheAufmassM2: zahlFeld,
  bemerkung: z.string().trim(),
});

type FormValues = z.infer<typeof schema>;

function alsZahl(wert: string): number | null {
  const t = wert.trim();
  if (!t) return null;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function alsText(wert: number | null | undefined): string {
  return wert === null || wert === undefined ? "" : String(wert);
}

export function EinheitForm({
  einheit,
  objekte,
  vorauswahlObjektId,
  onDone,
  onLoeschenAnfragen,
}: {
  einheit?: Einheit;
  objekte: Objekt[];
  vorauswahlObjektId?: string | null;
  onDone: () => void;
  onLoeschenAnfragen?: () => void;
}) {
  const istBearbeitung = Boolean(einheit);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      id: einheit?.id ?? "",
      objektId: einheit?.objektId ?? vorauswahlObjektId ?? "",
      hausteil: einheit?.hausteil ?? "",
      lage: einheit?.lage ?? "",
      nutzungsart: einheit?.nutzungsart ?? "wohnen",
      status: einheit?.status ?? "leerstand",
      flaecheM2: alsText(einheit?.flaecheM2),
      flaecheAufmassM2: alsText(einheit?.flaecheAufmassM2),
      bemerkung: einheit?.bemerkung ?? "",
    },
  });

  const onSubmit = async (values: FormValues) => {
    try {
      await verwaltungApi.saveEinheit({
        id: values.id,
        objektId: values.objektId,
        hausteil: values.hausteil,
        lage: values.lage,
        nutzungsart: values.nutzungsart,
        status: values.status,
        flaecheM2: alsZahl(values.flaecheM2),
        flaecheAufmassM2: alsZahl(values.flaecheAufmassM2),
        bemerkung: values.bemerkung,
      });
      toast.success(
        istBearbeitung ? "Einheit aktualisiert" : "Einheit angelegt",
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
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="id">ID</Label>
          <Input
            id="id"
            placeholder="APO-11"
            readOnly={istBearbeitung}
            className={istBearbeitung ? "bg-muted text-text-muted" : undefined}
            {...form.register("id")}
          />
          {fehler.id ? (
            <p className="text-xs text-danger">{fehler.id.message}</p>
          ) : null}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="objektId">Objekt</Label>
          <Controller
            control={form.control}
            name="objektId"
            render={({ field }) => (
              <Select
                value={field.value || undefined}
                onValueChange={field.onChange}
              >
                <SelectTrigger id="objektId" className="rounded-none">
                  <SelectValue placeholder="Objekt wählen" />
                </SelectTrigger>
                <SelectContent>
                  {objekte.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.bezeichnung}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {fehler.objektId ? (
            <p className="text-xs text-danger">{fehler.objektId.message}</p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="hausteil">Hausteil / Aufgang</Label>
        <Input id="hausteil" {...form.register("hausteil")} />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="lage">Lage / Einheit</Label>
        <Input id="lage" placeholder="2. OG links" {...form.register("lage")} />
        {fehler.lage ? (
          <p className="text-xs text-danger">{fehler.lage.message}</p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="nutzungsart">Nutzungsart</Label>
          <Controller
            control={form.control}
            name="nutzungsart"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="nutzungsart" className="rounded-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NUTZUNGSARTEN.map((n) => (
                    <SelectItem key={n} value={n}>
                      {NUTZUNGSART_LABEL[n]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
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
          <p className="text-xs text-text-subtle">
            Bei aktivem Mietverhältnis wird der Status automatisch auf
            „Vermietet“ gesetzt.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="flaecheM2">Fläche (m²)</Label>
          <Input
            id="flaecheM2"
            inputMode="decimal"
            {...form.register("flaecheM2")}
          />
          {fehler.flaecheM2 ? (
            <p className="text-xs text-danger">{fehler.flaecheM2.message}</p>
          ) : null}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="flaecheAufmassM2">Fläche Aufmaß (m²)</Label>
          <Input
            id="flaecheAufmassM2"
            inputMode="decimal"
            {...form.register("flaecheAufmassM2")}
          />
          {fehler.flaecheAufmassM2 ? (
            <p className="text-xs text-danger">
              {fehler.flaecheAufmassM2.message}
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="bemerkung">Bemerkung</Label>
        <Input id="bemerkung" {...form.register("bemerkung")} />
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

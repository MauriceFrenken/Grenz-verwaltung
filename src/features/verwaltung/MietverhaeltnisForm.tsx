import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
import { toast } from "sonner";
import { verwaltungApi } from "@/api/verwaltung";
import { useApi } from "@/hooks/useApi";
import { useAktionGuard } from "@/hooks/useAktionGuard";
import { useMandant } from "@/hooks/useMandant";
import { apiFehlermeldung } from "@/lib/apiFehlermeldung";
import type { Mietverhaeltnis } from "@/types";

const schema = z.object({
  mieterName: z.string().trim().min(2, "Bitte Mietername angeben"),
  einheitId: z.string().min(1, "Bitte Einheit wählen"),
  kaltmiete: z.coerce.number().nonnegative(),
  nkVorauszahlung: z.coerce.number().nonnegative(),
  beginn: z.string().min(1, "Beginn erforderlich"),
  ende: z.string().optional().or(z.literal("")),
  status: z.enum(["geplant", "aktiv", "gekuendigt", "beendet"]),
  umlagefaehigeKostenarten: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

function werteAusMietverhaeltnis(mv: Mietverhaeltnis): FormValues {
  return {
    mieterName: mv.mieterName,
    einheitId: mv.einheitId,
    kaltmiete: mv.kaltmiete,
    nkVorauszahlung: mv.nkVorauszahlung,
    beginn: mv.beginn,
    ende: mv.ende ?? "",
    status: mv.status,
    umlagefaehigeKostenarten: mv.umlagefaehigeKostenarten.join(", "),
  };
}

export function MietverhaeltnisForm({
  mietverhaeltnis,
  onDone,
  onLoeschenAnfragen,
}: {
  mietverhaeltnis?: Mietverhaeltnis;
  onDone: () => void;
  onLoeschenAnfragen?: () => void;
}) {
  const istBearbeitung = Boolean(mietverhaeltnis);
  const [mitEnde, setMitEnde] = useState(Boolean(mietverhaeltnis?.ende));
  const { aktiveMandantId } = useMandant();
  const { erlaubtOderHinweis } = useAktionGuard();
  const einheiten = useApi(
    () => verwaltungApi.listEinheiten({ mandantId: aktiveMandantId ?? undefined }),
    [aktiveMandantId],
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: mietverhaeltnis
      ? werteAusMietverhaeltnis(mietverhaeltnis)
      : {
          mieterName: "",
          einheitId: "",
          kaltmiete: 0,
          nkVorauszahlung: 0,
          beginn: "",
          ende: "",
          status: "geplant",
          umlagefaehigeKostenarten: "",
        },
  });

  useEffect(() => {
    if (!mietverhaeltnis) return;
    form.reset(werteAusMietverhaeltnis(mietverhaeltnis));
    setMitEnde(Boolean(mietverhaeltnis.ende));
  }, [mietverhaeltnis, form]);

  const onSubmit = async (values: FormValues) => {
    const berechtigung = istBearbeitung
      ? "aktion.verwaltung.mietverhaeltnisse.bearbeiten"
      : "aktion.verwaltung.mietverhaeltnisse.anlegen";
    if (!erlaubtOderHinweis(berechtigung)) return;

    const payload = {
      mieterName: values.mieterName,
      kaltmiete: values.kaltmiete,
      nkVorauszahlung: values.nkVorauszahlung,
      beginn: values.beginn,
      ende: values.ende || null,
      status: values.status,
      umlagefaehigeKostenarten: (values.umlagefaehigeKostenarten ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    };

    try {
      if (istBearbeitung && mietverhaeltnis) {
        await verwaltungApi.updateMietverhaeltnis(mietverhaeltnis.id, payload);
        toast.success("Mietverhältnis aktualisiert");
      } else {
        await verwaltungApi.createMietverhaeltnis({
          ...payload,
          einheitId: values.einheitId,
          objektId: "",
        });
        toast.success("Mietverhältnis angelegt");
      }
      onDone();
    } catch (err) {
      toast.error(apiFehlermeldung(err));
    }
  };

  const einheitenListe = einheiten.data?.items ?? [];
  const aktuelleEinheit = einheitenListe.find((e) => e.id === mietverhaeltnis?.einheitId);

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="mieterName">Mieter</Label>
        <Input id="mieterName" {...form.register("mieterName")} />
        {form.formState.errors.mieterName ? (
          <p className="text-xs text-danger">{form.formState.errors.mieterName.message}</p>
        ) : null}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="einheitId">Einheit</Label>
        {istBearbeitung ? (
          <Input
            id="einheitId"
            readOnly
            value={
              aktuelleEinheit
                ? `${aktuelleEinheit.id} · ${aktuelleEinheit.lage}`
                : mietverhaeltnis?.einheitId ?? ""
            }
            className="bg-surface-muted"
          />
        ) : (
          <Controller
            control={form.control}
            name="einheitId"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange} disabled={einheitenListe.length === 0}>
                <SelectTrigger id="einheitId" className="rounded-none">
                  <SelectValue placeholder={einheitenListe.length === 0 ? "Keine Einheit vorhanden" : "Einheit wählen"} />
                </SelectTrigger>
                <SelectContent>
                  {einheitenListe.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.id} · {e.lage}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        )}
        {form.formState.errors.einheitId ? (
          <p className="text-xs text-danger">{form.formState.errors.einheitId.message}</p>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="kaltmiete">Kaltmiete (€)</Label>
          <Input id="kaltmiete" type="number" step="0.01" {...form.register("kaltmiete")} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="nkVorauszahlung">NK-Vorauszahlung (€)</Label>
          <Input id="nkVorauszahlung" type="number" step="0.01" {...form.register("nkVorauszahlung")} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        <Label htmlFor="beginn">Beginn</Label>
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="mitEnde" className="cursor-pointer">
            Ende (optional)
          </Label>
          <Switch
            id="mitEnde"
            checked={mitEnde}
            onCheckedChange={(checked) => {
              setMitEnde(checked);
              if (!checked) form.setValue("ende", "");
            }}
          />
        </div>
        <Input id="beginn" type="date" {...form.register("beginn")} />
        {mitEnde ? <Input id="ende" type="date" {...form.register("ende")} /> : null}
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
                <SelectItem value="geplant">Geplant</SelectItem>
                <SelectItem value="aktiv">Aktiv</SelectItem>
                <SelectItem value="gekuendigt">Gekündigt</SelectItem>
                <SelectItem value="beendet">Beendet</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="umlagefaehigeKostenarten">Umlagefähige Kostenarten (komma-getrennt)</Label>
        <Input
          id="umlagefaehigeKostenarten"
          placeholder="z. B. heizung, wasser, muell"
          {...form.register("umlagefaehigeKostenarten")}
        />
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
            disabled={form.formState.isSubmitting || (!istBearbeitung && einheitenListe.length === 0)}
            className="bg-primary text-primary-foreground hover:bg-heading"
          >
            {form.formState.isSubmitting ? "Wird gespeichert…" : "Speichern"}
          </Button>
        </div>
      </div>
    </form>
  );
}

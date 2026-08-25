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
import type { Gesellschaft, Objekt, ObjektStatus } from "@/types";

const STATUS: ObjektStatus[] = ["aktiv", "inaktiv", "in_ankauf", "verkauft"];

const schema = z.object({
  id: z
    .string()
    .trim()
    .min(2, "Bitte ID angeben")
    .refine(
      (v) => istGueltigeSlugId(v, "objekt"),
      "Nur Buchstaben, Zahlen, Bindestrich und Unterstrich",
    ),
  gesellschaftId: z.string().trim().min(1, "Bitte Gesellschaft wählen"),
  bezeichnung: z.string().trim().min(2, "Bitte Bezeichnung angeben"),
  strasse: z.string().trim(),
  plz: z.string().trim(),
  ort: z.string().trim(),
  status: z.enum(["aktiv", "inaktiv", "in_ankauf", "verkauft"]),
  bemerkung: z.string().trim(),
});

type FormValues = z.infer<typeof schema>;

export function ObjektForm({
  objekt,
  gesellschaften,
  vorauswahlGesellschaftId,
  onDone,
  onLoeschenAnfragen,
}: {
  objekt?: Objekt;
  gesellschaften: Gesellschaft[];
  vorauswahlGesellschaftId?: string | null;
  onDone: () => void;
  onLoeschenAnfragen?: () => void;
}) {
  const istBearbeitung = Boolean(objekt);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      id: objekt?.id ?? "",
      gesellschaftId: objekt?.gesellschaftId ?? vorauswahlGesellschaftId ?? "",
      bezeichnung: objekt?.bezeichnung ?? "",
      strasse: objekt?.adresse.strasse ?? "",
      plz: objekt?.adresse.plz ?? "",
      ort: objekt?.adresse.ort ?? "",
      status: objekt?.status ?? "aktiv",
      bemerkung: objekt?.bemerkung ?? "",
    },
  });

  const onSubmit = async (values: FormValues) => {
    try {
      await verwaltungApi.saveObjekt({
        id: values.id,
        gesellschaftId: values.gesellschaftId,
        bezeichnung: values.bezeichnung,
        adresse: {
          strasse: values.strasse,
          plz: values.plz,
          ort: values.ort,
          land: "DE",
        },
        status: values.status,
        bemerkung: values.bemerkung,
      });
      toast.success(istBearbeitung ? "Objekt aktualisiert" : "Objekt angelegt");
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
            placeholder="O-06"
            readOnly={istBearbeitung}
            className={istBearbeitung ? "bg-muted text-text-muted" : undefined}
            {...form.register("id")}
          />
          {fehler.id ? (
            <p className="text-xs text-danger">{fehler.id.message}</p>
          ) : null}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="gesellschaftId">Gesellschaft</Label>
          <Controller
            control={form.control}
            name="gesellschaftId"
            render={({ field }) => (
              <Select
                value={field.value || undefined}
                onValueChange={field.onChange}
              >
                <SelectTrigger id="gesellschaftId" className="rounded-none">
                  <SelectValue placeholder="Gesellschaft wählen" />
                </SelectTrigger>
                <SelectContent>
                  {gesellschaften.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {`${g.name} (${g.kuerzel})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {fehler.gesellschaftId ? (
            <p className="text-xs text-danger">
              {fehler.gesellschaftId.message}
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="bezeichnung">Objekt</Label>
        <Input
          id="bezeichnung"
          placeholder="Musterstrasse 1"
          {...form.register("bezeichnung")}
        />
        {fehler.bezeichnung ? (
          <p className="text-xs text-danger">{fehler.bezeichnung.message}</p>
        ) : null}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="strasse">Straße</Label>
        <Input id="strasse" {...form.register("strasse")} />
      </div>

      <div className="grid grid-cols-[8rem_1fr] gap-4">
        <div className="grid gap-2">
          <Label htmlFor="plz">PLZ</Label>
          <Input id="plz" inputMode="numeric" {...form.register("plz")} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="ort">Ort</Label>
          <Input id="ort" {...form.register("ort")} />
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

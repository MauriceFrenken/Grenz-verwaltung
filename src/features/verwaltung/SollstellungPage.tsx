import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/PageHeader";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PermissionGate } from "@/components/auth/PermissionGate";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useApi } from "@/hooks/useApi";
import { useAktionGuard } from "@/hooks/useAktionGuard";
import { buchhaltungApi } from "@/api/buchhaltung";
import { verwaltungApi } from "@/api/verwaltung";
import { apiFehlermeldung } from "@/lib/apiFehlermeldung";
import type { SollstellungLauf } from "@/types";
import { ALLE } from "./StammdatenFilter";
import { VerwaltungTabellenLeiste } from "./TabellenSuche";
import { useTabellenSuche } from "./useTabellenSuche";
import { euro, monatLabel } from "./format";

const spalten: Column<SollstellungLauf>[] = [
  {
    key: "zeitraum",
    header: "Monat",
    render: (l) => (
      <span className="font-medium text-heading">{monatLabel(l.zeitraum)}</span>
    ),
  },
  {
    key: "gesellschaft",
    header: "Scope",
    render: (l) =>
      l.gesellschaftName
        ? `${l.gesellschaftName}${l.gesellschaftKuerzel ? ` (${l.gesellschaftKuerzel})` : ""}`
        : "Alle Gesellschaften",
  },
  {
    key: "soll",
    header: "Soll",
    align: "right",
    render: (l) => euro(l.sollSumme),
  },
  {
    key: "ist",
    header: "Ist",
    align: "right",
    render: (l) => euro(l.istSumme),
  },
  {
    key: "diff",
    header: "Differenz",
    align: "right",
    render: (l) => (
      <span className={l.differenzSumme > 0.009 ? "text-danger" : undefined}>
        {euro(l.differenzSumme)}
      </span>
    ),
  },
  {
    key: "offen",
    header: "Offen",
    align: "right",
    render: (l) => {
      const n = l.anzahlFehlt + l.anzahlTeilweise;
      return n > 0 ? (
        <span className="text-danger">{n}</span>
      ) : (
        <span>{n}</span>
      );
    },
  },
  {
    key: "bank",
    header: "Auszüge",
    align: "right",
    render: (l) => String(l.anzahlBankauszuege),
  },
  {
    key: "status",
    header: "Status",
    render: (l) => <StatusBadge status={l.status} />,
  },
];

const suchfelder = [
  (l: SollstellungLauf) => l.zeitraum,
  (l: SollstellungLauf) => monatLabel(l.zeitraum),
  (l: SollstellungLauf) => l.gesellschaftName,
  (l: SollstellungLauf) => l.gesellschaftKuerzel,
  (l: SollstellungLauf) => l.status,
];

function aktuellerMonat(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function SollstellungPage() {
  const navigate = useNavigate();
  const { erlaubtOderHinweis } = useAktionGuard();
  const [suche, setSuche] = useState("");
  const [erzeugenOffen, setErzeugenOffen] = useState(false);
  const [zeitraum, setZeitraum] = useState(aktuellerMonat);
  const [gesellschaftId, setGesellschaftId] = useState<string | null>(null);
  const [speichernLaeuft, setSpeichernLaeuft] = useState(false);

  const gesellschaften = useApi(() => verwaltungApi.listGesellschaften(), []);
  const { data, isLoading, isEmpty, reload } = useApi(
    () => buchhaltungApi.listSollstellungLaeufe(),
    [],
  );
  const zeilen = useTabellenSuche(data?.items ?? [], suche, suchfelder);

  const erzeugen = async () => {
    if (!erlaubtOderHinweis("aktion.buchhaltung.sollstellung.erzeugen")) return;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(zeitraum)) {
      toast.error("Ungültiger Monat");
      return;
    }
    setSpeichernLaeuft(true);
    try {
      const id = await buchhaltungApi.erzeugeSollstellungLauf({
        zeitraum,
        gesellschaftId,
      });
      toast.success("Sollstellung erzeugt");
      setErzeugenOffen(false);
      reload();
      void navigate({ to: "/verwaltung/sollstellung/$id", params: { id } });
    } catch (err) {
      toast.error(apiFehlermeldung(err));
    } finally {
      setSpeichernLaeuft(false);
    }
  };

  return (
    <>
      <PageHeader
        titel="Sollstellung"
        aktionen={
          <PermissionGate berechtigung="aktion.buchhaltung.sollstellung.erzeugen">
            <Button
              size="sm"
              className="bg-primary text-primary-foreground hover:bg-heading"
              onClick={() => {
                setZeitraum(aktuellerMonat());
                setGesellschaftId(null);
                setErzeugenOffen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" strokeWidth={1.5} />
              Neue Sollstellung
            </Button>
          </PermissionGate>
        }
      />
      <PageWrapper>
        <VerwaltungTabellenLeiste
          suchbegriff={suche}
          onSuchbegriffChange={setSuche}
          placeholder="Monat, Gesellschaft…"
        />
        <DataTable
          spalten={spalten}
          zeilen={zeilen}
          isLoading={isLoading}
          isEmpty={isEmpty && !suche.trim()}
          rowKey={(l) => l.id}
          emptyTitel={
            suche.trim() ? "Keine Treffer" : "Noch keine Sollstellung"
          }
          onRowClick={(l) =>
            void navigate({
              to: "/verwaltung/sollstellung/$id",
              params: { id: l.id },
            })
          }
        />
      </PageWrapper>

      <Dialog open={erzeugenOffen} onOpenChange={setErzeugenOffen}>
        <DialogContent className="max-w-md overflow-hidden">
          <DialogHeader>
            <DialogTitle>Neue Sollstellung</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="soll-monat" className="label-caps text-text-subtle">
                Monat
              </Label>
              <Input
                id="soll-monat"
                type="month"
                value={zeitraum}
                onChange={(e) => setZeitraum(e.target.value)}
                className="rounded-none"
              />
            </div>
            <div className="grid gap-2">
              <Label
                htmlFor="soll-gesellschaft"
                className="label-caps text-text-subtle"
              >
                Gesellschaft
              </Label>
              <Select
                value={gesellschaftId ?? ALLE}
                onValueChange={(v) =>
                  setGesellschaftId(v === ALLE ? null : v)
                }
              >
                <SelectTrigger
                  id="soll-gesellschaft"
                  className="w-full rounded-none"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALLE}>Alle Gesellschaften</SelectItem>
                  {(gesellschaften.data?.items ?? []).map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {`${g.name} (${g.kuerzel})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="rounded-none"
              onClick={() => setErzeugenOffen(false)}
              disabled={speichernLaeuft}
            >
              Abbrechen
            </Button>
            <Button
              className="rounded-none bg-primary text-primary-foreground hover:bg-heading"
              onClick={() => void erzeugen()}
              disabled={speichernLaeuft}
            >
              {speichernLaeuft ? "Erzeugen…" : "Erzeugen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

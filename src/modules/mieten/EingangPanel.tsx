import { Ban, Check, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { DetailPanel, PanelAbschnitt } from "@/components/board/DetailPanel";
import { Knopf } from "@/components/board/Knopf";
import { Kennzahlen } from "@/components/board/Layout";
import type { MietEingang, Mietkonto } from "@/lib/db/mieten";
import { datum, euro } from "@/lib/format/de";
import { cn } from "@/lib/utils";
import { textNorm, vorschlaege } from "./logik/mieten";
import { useMietenAktionen } from "./useMieten";

/**
 * Offenen Eingang von Hand zuordnen (auch aufgeteilt auf mehrere Verträge)
 * oder als "keine Miete" markieren. Die Entscheidung wird gelernt.
 */
export function EingangPanel({
  eingang: e,
  konten,
  onSchliessen,
}: {
  eingang: MietEingang | null;
  konten: Mietkonto[];
  onSchliessen: () => void;
}) {
  return (
    <DetailPanel
      offen={Boolean(e)}
      onSchliessen={onSchliessen}
      titel={e ? `${euro(e.betrag)} von ${e.zahler || "unbekannt"}` : ""}
      unterzeile={e ? `Eingang am ${datum(e.datum)}` : undefined}
      breite="lg"
    >
      {e ? (
        <Inhalt
          key={e.bankbuchungId}
          e={e}
          konten={konten}
          onFertig={onSchliessen}
        />
      ) : null}
    </DetailPanel>
  );
}

function Inhalt({
  e,
  konten,
  onFertig,
}: {
  e: MietEingang;
  konten: Mietkonto[];
  onFertig: () => void;
}) {
  const aktionen = useMietenAktionen();
  const liste = useMemo(() => vorschlaege(e, konten), [e, konten]);
  const [gewaehlt, setGewaehlt] = useState<string[]>(() => {
    const [a, b] = liste;
    return a && a.punkte >= 3 && (!b || b.punkte < a.punkte)
      ? [a.konto.leaseId]
      : [];
  });
  const [suche, setSuche] = useState("");
  const [merken, setMerken] = useState(!e.sammelzahler);
  const [zahlerIgnorieren, setZahlerIgnorieren] = useState(false);
  const [laeuft, setLaeuft] = useState(false);

  const q = textNorm(suche);
  const sichtbar = liste.filter(
    (v) =>
      !q ||
      textNorm(
        `${v.konto.mieter} ${v.konto.einheitId} ${v.konto.objektName}`,
      ).includes(q),
  );
  const summeSoll = liste
    .filter((v) => gewaehlt.includes(v.konto.leaseId))
    .reduce((s, v) => s + v.konto.monatssoll, 0);

  const umschalten = (id: string) =>
    setGewaehlt((g) =>
      g.includes(id) ? g.filter((x) => x !== id) : [...g, id],
    );

  const ausfuehren = async (f: () => Promise<boolean>) => {
    setLaeuft(true);
    const ok = await f();
    setLaeuft(false);
    if (ok) onFertig();
  };

  return (
    <>
      <PanelAbschnitt titel="Buchung">
        <Kennzahlen
          spalten={2}
          eintraege={[
            { label: "Zahler", wert: e.zahler || "–" },
            { label: "IBAN", wert: e.gegenIban ?? "nicht übermittelt" },
            { label: "Verwendungszweck", wert: e.zweck || "–" },
            { label: "Betrag", wert: euro(e.betrag), hervorheben: true },
          ]}
        />
        {e.sammelzahler ? (
          <p className="mt-3 text-xs text-text-muted">
            Amt oder Jobcenter: zahlt für viele Mieter. Gemerkt wird deshalb nur
            die Referenznummer im Verwendungszweck, nicht der Zahler.
          </p>
        ) : null}
        {e.kaution ? (
          <p className="mt-3 text-xs text-text-muted">
            Der Text nennt eine Kaution. Kautionen gehören nicht ins Mietkonto.
          </p>
        ) : null}
      </PanelAbschnitt>

      <PanelAbschnitt titel="Mietvertrag wählen">
        <label className="relative mb-2 flex items-center">
          <Search className="pointer-events-none absolute left-2.5 size-3.5 text-text-subtle" />
          <span className="sr-only">Mieter suchen</span>
          <input
            value={suche}
            onChange={(x) => setSuche(x.target.value)}
            placeholder="Mieter, Einheit oder Objekt suchen"
            className="h-8 w-full rounded-md border border-hairline bg-surface pl-8 pr-3 text-sm outline-none placeholder:text-text-subtle focus:border-input"
          />
        </label>
        <ul className="max-h-[320px] divide-y divide-hairline overflow-y-auto rounded-lg border border-hairline">
          {sichtbar.map(({ konto: k, punkte, gruende }) => {
            const an = gewaehlt.includes(k.leaseId);
            return (
              <li key={k.leaseId}>
                <button
                  type="button"
                  onClick={() => umschalten(k.leaseId)}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-surface-muted/60",
                    an && "bg-brand-soft/60 hover:bg-brand-soft/80",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded border",
                      an ? "border-brand bg-brand text-white" : "border-input",
                    )}
                    aria-hidden
                  >
                    {an ? <Check className="size-3" /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-foreground">
                      {k.mieter}
                    </span>
                    <span className="block truncate text-xs text-text-subtle">
                      {k.objektName} · {k.einheitId}
                      {k.rueckstand >= 1
                        ? ` · Rückstand ${euro(k.rueckstand)}`
                        : ""}
                    </span>
                  </span>
                  {punkte >= 2 && gruende.length ? (
                    <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] text-heading">
                      {gruende.join(" · ")}
                    </span>
                  ) : null}
                  <span className="ziffern shrink-0 text-sm text-text-muted">
                    {euro(k.monatssoll)}
                  </span>
                </button>
              </li>
            );
          })}
          {sichtbar.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-text-muted">
              Kein Vertrag gefunden.
            </li>
          ) : null}
        </ul>
        {gewaehlt.length > 1 ? (
          <p className="mt-2 text-xs text-text-muted">
            Wird anteilig nach Monatssoll aufgeteilt (zusammen {euro(summeSoll)}
            ).
          </p>
        ) : null}
        <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={merken}
            onChange={(x) => setMerken(x.target.checked)}
            className="mt-0.5 accent-[var(--primary)]"
          />
          <span>
            {e.sammelzahler ? "Referenznummer merken" : "Zahler merken"}
            <span className="block text-xs text-text-muted">
              Weitere Zahlungen dieses Zahlers werden ab jetzt automatisch
              zugeordnet, auch rückwirkend.
            </span>
          </span>
        </label>
        <div className="mt-4 flex justify-end">
          <Knopf
            variante="primaer"
            disabled={gewaehlt.length === 0 || laeuft}
            onClick={() =>
              void ausfuehren(() =>
                aktionen.zuordnen(e.bankbuchungId, gewaehlt, merken),
              )
            }
          >
            <Check />
            {gewaehlt.length > 1
              ? `${gewaehlt.length} Verträgen zuordnen`
              : "Zuordnen"}
          </Knopf>
        </div>
      </PanelAbschnitt>

      <PanelAbschnitt titel="Keine Miete">
        <p className="mb-3 text-sm text-text-muted">
          Zum Beispiel Erstattungen, Kautionen oder Zahlungen für verkaufte
          Objekte.
        </p>
        {!e.sammelzahler ? (
          <label className="mb-3 flex cursor-pointer items-start gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={zahlerIgnorieren}
              onChange={(x) => setZahlerIgnorieren(x.target.checked)}
              className="mt-0.5 accent-[var(--primary)]"
            />
            <span>
              Alle Zahlungen von „{e.zahler || "diesem Zahler"}“ übergehen
              <span className="block text-xs text-text-muted">
                Sie erscheinen dann nicht mehr in dieser Liste.
              </span>
            </span>
          </label>
        ) : null}
        <Knopf
          disabled={laeuft}
          onClick={() =>
            void ausfuehren(() =>
              aktionen.keineMiete(e.bankbuchungId, zahlerIgnorieren),
            )
          }
        >
          <Ban />
          Keine Miete
        </Knopf>
      </PanelAbschnitt>
    </>
  );
}

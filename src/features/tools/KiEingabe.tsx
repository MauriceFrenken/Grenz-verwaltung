import {
  ArrowUp,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  X,
} from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { useAuth } from "@/hooks/useAuth";
import { ANNEHMEN, dateiVorbereiten, type Anhang } from "@/lib/ki-tools/client";
import { cn } from "@/lib/utils";

import { OrdnerDialog } from "./OrdnerDialog";

/**
 * Eingabefeld wie bei Claude: Anweisung schreiben, Unterlagen per Büroklammer oder Drag & Drop
 * anhängen oder einen Objektordner aus der OneDrive-Ablage verbinden. Wiederverwendbar für alle Tools.
 */
export function KiEingabe({
  text,
  onText,
  anhaenge,
  onAnhaenge,
  onSenden,
  laeuft,
  platzhalter,
  hinweis,
  zusatz,
  annehmen = ANNEHMEN,
}: {
  text: string;
  onText: (text: string) => void;
  anhaenge: Anhang[];
  onAnhaenge: (neu: (vorher: Anhang[]) => Anhang[]) => void;
  onSenden: () => void;
  laeuft: boolean;
  platzhalter: string;
  /** Kleiner Hinweis unter dem Feld, z. B. welche Unterlagen am meisten helfen. */
  hinweis?: string;
  /** Weitere Schalter in der Fußzeile (z. B. Websuche). */
  zusatz?: ReactNode;
  annehmen?: string;
}) {
  const { session } = useAuth();
  const token = session?.access_token ?? "";
  const dateiInput = useRef<HTMLInputElement>(null);
  const [ziehen, setZiehen] = useState(false);
  const [lesen, setLesen] = useState(0);
  const [ordnerOffen, setOrdnerOffen] = useState(false);
  const [ordner, setOrdner] = useState<string | null>(null);

  async function dateienHinzufuegen(dateien: File[]) {
    if (!dateien.length) return;
    setLesen((n) => n + dateien.length);
    await Promise.all(
      dateien.map(async (datei) => {
        try {
          const anhang = await dateiVorbereiten(datei);
          onAnhaenge((vorher) => [
            ...vorher.filter((a) => a.name !== anhang.name),
            anhang,
          ]);
        } catch (e) {
          toast.error(
            e instanceof Error
              ? e.message
              : `${datei.name} konnte nicht gelesen werden.`,
            { duration: 8_000 },
          );
        } finally {
          setLesen((n) => n - 1);
        }
      }),
    );
  }

  const kannSenden =
    !laeuft && lesen === 0 && (text.trim().length > 0 || anhaenge.length > 0);
  const unterlagen = anhaenge.filter((a) => a.art === "unterlage");
  const bilder = anhaenge.filter((a) => a.art === "bild");

  return (
    <div
      className={cn(
        "relative rounded-2xl border border-hairline bg-surface shadow-sm transition-colors focus-within:border-heading/30",
        ziehen && "border-heading/50 bg-muted/40",
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setZiehen(true);
      }}
      onDragLeave={() => setZiehen(false)}
      onDrop={(e) => {
        e.preventDefault();
        setZiehen(false);
        void dateienHinzufuegen(Array.from(e.dataTransfer.files));
      }}
    >
      {(anhaenge.length > 0 || lesen > 0 || ordner) && (
        <div className="flex flex-wrap gap-2 border-b border-hairline p-3">
          {ordner && (
            <span className="flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1.5 text-xs font-medium text-heading">
              <FolderOpen className="h-3.5 w-3.5" strokeWidth={1.5} />
              {ordner}
              <button
                type="button"
                aria-label="Ordner trennen"
                className="text-text-muted hover:text-heading"
                onClick={() => {
                  setOrdner(null);
                  onAnhaenge((vorher) =>
                    vorher.filter((a) => a.quelle !== "ordner"),
                  );
                }}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {unterlagen.map((a) => (
            <Chip
              key={a.id}
              name={a.name}
              onEntfernen={() =>
                onAnhaenge((v) => v.filter((x) => x.id !== a.id))
              }
            >
              <FileText
                className="h-3.5 w-3.5 shrink-0 text-text-muted"
                strokeWidth={1.5}
              />
            </Chip>
          ))}
          {bilder.map((a) => (
            <Chip
              key={a.id}
              name={a.name}
              onEntfernen={() =>
                onAnhaenge((v) => v.filter((x) => x.id !== a.id))
              }
            >
              {a.art === "bild" ? (
                <img
                  src={a.vorschau}
                  alt=""
                  className="h-5 w-5 shrink-0 rounded object-cover"
                />
              ) : (
                <ImageIcon className="h-3.5 w-3.5" />
              )}
            </Chip>
          ))}
          {lesen > 0 && (
            <span className="flex items-center gap-1.5 rounded-lg border border-dashed border-hairline px-2.5 py-1.5 text-xs text-text-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> {lesen}{" "}
              {lesen === 1 ? "Datei wird" : "Dateien werden"} gelesen
            </span>
          )}
        </div>
      )}

      <textarea
        value={text}
        onChange={(e) => onText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            if (kannSenden) onSenden();
          }
        }}
        onPaste={(e) => {
          const dateien = Array.from(e.clipboardData.files);
          if (dateien.length) {
            e.preventDefault();
            void dateienHinzufuegen(dateien);
          }
        }}
        rows={3}
        placeholder={platzhalter}
        className="block max-h-72 min-h-[84px] w-full resize-y bg-transparent px-4 pt-3 text-sm text-heading placeholder:text-text-muted focus:outline-none"
      />

      <div className="flex flex-wrap items-center gap-1 px-2 pb-2">
        <input
          ref={dateiInput}
          type="file"
          multiple
          accept={annehmen}
          className="hidden"
          onChange={(e) => {
            void dateienHinzufuegen(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => dateiInput.current?.click()}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-muted hover:text-heading"
          aria-label="Dateien anhängen"
          title="Dateien anhängen (PDF, Excel, CSV, Fotos)"
        >
          <Paperclip className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setOrdnerOffen(true)}
          className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-text-muted hover:bg-muted hover:text-heading"
        >
          <FolderOpen className="h-4 w-4" strokeWidth={1.5} />
          Objektordner verbinden
        </button>
        {zusatz}
        <button
          type="button"
          onClick={onSenden}
          disabled={!kannSenden}
          className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg bg-heading text-surface transition-opacity disabled:opacity-30"
          aria-label="Senden"
        >
          {laeuft ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowUp className="h-4 w-4" />
          )}
        </button>
      </div>

      {ziehen && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl text-sm font-medium text-heading">
          Dateien hier ablegen
        </div>
      )}

      {hinweis && (
        <p className="border-t border-hairline px-4 py-2 text-xs text-text-muted">
          {hinweis}
        </p>
      )}

      <OrdnerDialog
        offen={ordnerOffen}
        onOffen={setOrdnerOffen}
        token={token}
        onVerbunden={(name, neu, uebersprungen) => {
          setOrdner(name);
          onAnhaenge((vorher) => [
            ...vorher.filter((a) => a.quelle !== "ordner"),
            ...neu,
          ]);
          if (uebersprungen.length)
            toast.message(
              `${neu.length} Dateien geladen, ${uebersprungen.length} übersprungen`,
              {
                description:
                  uebersprungen.slice(0, 6).join("\n") +
                  (uebersprungen.length > 6 ? "\n…" : ""),
                duration: 8_000,
              },
            );
        }}
      />
    </div>
  );
}

function Chip({
  name,
  children,
  onEntfernen,
}: {
  name: string;
  children: ReactNode;
  onEntfernen: () => void;
}) {
  return (
    <span className="flex max-w-[16rem] items-center gap-1.5 rounded-lg border border-hairline bg-surface px-2.5 py-1.5 text-xs text-heading">
      {children}
      <span className="truncate" title={name}>
        {name}
      </span>
      <button
        type="button"
        aria-label={`${name} entfernen`}
        className="text-text-muted hover:text-heading"
        onClick={onEntfernen}
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

import * as Menu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronsUpDown } from "lucide-react";
import { SEGMENT_LABEL, type Company } from "@/lib/db/typen";
import { cn } from "@/lib/utils";
import { useBoardUi } from "./store";

export function GesellschaftsAuswahl({ companies }: { companies: Company[] }) {
  const gesellschaft = useBoardUi((s) => s.gesellschaft);
  const setGesellschaft = useBoardUi((s) => s.setGesellschaft);
  const aktiv = companies.find((c) => c.id === gesellschaft);

  return (
    <Menu.Root>
      <Menu.Trigger
        className="flex h-8 min-w-0 max-w-[260px] cursor-pointer items-center gap-2 rounded-md border border-hairline bg-surface-muted pl-2.5 pr-2 text-sm text-heading transition-colors hover:border-text-subtle focus-visible:outline-2 focus-visible:outline-brand"
        aria-label="Gesellschaft auswählen"
      >
        <span
          className={cn(
            "flex size-5 shrink-0 items-center justify-center text-[10px] font-semibold",
            aktiv ? "bg-brand text-black" : "bg-hairline text-text-muted",
          )}
          aria-hidden
        >
          {aktiv ? aktiv.shortName.slice(0, 2) : "∑"}
        </span>
        <span className="truncate">
          {aktiv ? aktiv.name : "Alle Gesellschaften"}
        </span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-text-muted" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align="start"
          sideOffset={6}
          className="z-50 max-h-[70vh] w-[300px] overflow-y-auto rounded-lg border border-hairline bg-elevated p-1 text-sm shadow-[0_12px_32px_-8px_rgb(0_0_0/0.2)] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          <Eintrag
            aktiv={gesellschaft === "alle"}
            onSelect={() => setGesellschaft("alle")}
            kurz="∑"
            name="Alle Gesellschaften"
            sub="Konsolidierte Sicht"
          />
          <Menu.Separator className="my-1 h-px bg-hairline" />
          {companies.map((c) => (
            <Eintrag
              key={c.id}
              aktiv={gesellschaft === c.id}
              onSelect={() => setGesellschaft(c.id)}
              kurz={c.shortName.slice(0, 2)}
              name={c.name}
              sub={SEGMENT_LABEL[c.segment]}
            />
          ))}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}

function Eintrag({
  aktiv,
  onSelect,
  kurz,
  name,
  sub,
}: {
  aktiv: boolean;
  onSelect: () => void;
  kurz: string;
  name: string;
  sub: string;
}) {
  return (
    <Menu.Item
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 outline-none data-[highlighted]:bg-surface-muted"
    >
      <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-surface-muted text-[10px] font-semibold text-text-muted">
        {kurz}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-foreground">{name}</span>
        <span className="block truncate text-xs text-text-subtle">{sub}</span>
      </span>
      {aktiv ? <Check className="size-4 text-primary" /> : null}
    </Menu.Item>
  );
}

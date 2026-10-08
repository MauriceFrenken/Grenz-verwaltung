import * as Dialog from "@radix-ui/react-dialog";
import { useNavigate } from "@tanstack/react-router";
import { Command } from "cmdk";
import {
  Building2,
  CornerDownLeft,
  Landmark,
  Search,
  User,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";
import { Taste } from "@/components/board/Knopf";
import type { BoardDaten } from "@/lib/db/typen";
import { euroKompakt } from "@/lib/format/de";
import { NAVIGATION } from "./navigation";
import { useBoardUi } from "./store";

/**
 * Befehlspalette (⌘K / Strg+K): zu jeder Seite, jedem Objekt, Darlehen und Mieter springen.
 */
export function Befehlspalette({ daten }: { daten: BoardDaten | undefined }) {
  const offen = useBoardUi((s) => s.paletteOffen);
  const setOffen = useBoardUi((s) => s.setPaletteOffen);
  const setGesellschaft = useBoardUi((s) => s.setGesellschaft);
  const navigate = useNavigate();

  const geh = (fn: () => void) => {
    setOffen(false);
    fn();
  };

  const name = (companyId: string | null, partyId: string | null) =>
    daten?.companies.find((c) => c.id === companyId)?.shortName ??
    daten?.parties.find((p) => p.id === partyId)?.name ??
    "–";

  return (
    <Dialog.Root open={offen} onOpenChange={setOffen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/25 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          className="fixed left-1/2 top-[14vh] z-50 w-[calc(100%-2rem)] max-w-[620px] -translate-x-1/2 overflow-hidden border border-hairline bg-elevated shadow-[0_24px_64px_-16px_rgb(0_0_0/0.35)] outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98] data-[state=open]:duration-150"
          aria-describedby={undefined}
        >
          <Dialog.Title className="sr-only">Befehlspalette</Dialog.Title>
          <Command
            loop
            className="flex flex-col"
            filter={(value, search) =>
              value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
            }
          >
            <div className="flex items-center gap-2.5 border-b border-hairline px-4">
              <Search className="size-4 text-text-subtle" />
              <Command.Input
                autoFocus
                placeholder="Seite, Objekt, Darlehen, Mieter oder Gesellschaft suchen…"
                className="h-12 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-text-subtle [--board-r:0]"
              />
              <Taste>Esc</Taste>
            </div>
            <Command.List className="max-h-[min(60vh,440px)] overflow-y-auto p-1.5">
              <Command.Empty className="px-3 py-8 text-center text-sm text-text-muted">
                Nichts gefunden.
              </Command.Empty>

              <Gruppe titel="Seiten">
                {NAVIGATION.map((n) => (
                  <Eintrag
                    key={n.to}
                    value={`Seite ${n.label} ${n.frage}`}
                    icon={<n.icon />}
                    onSelect={() => geh(() => navigate({ to: n.to }))}
                    titel={n.label}
                    sub={n.frage}
                  />
                ))}
              </Gruppe>

              {daten ? (
                <>
                  <Gruppe titel="Gesellschaften">
                    <Eintrag
                      value="Gesellschaft Alle Gesellschaften konsolidiert"
                      icon={<Users />}
                      onSelect={() => geh(() => setGesellschaft("alle"))}
                      titel="Alle Gesellschaften"
                      sub="Filter zurücksetzen"
                    />
                    {daten.companies.map((c) => (
                      <Eintrag
                        key={c.id}
                        value={`Gesellschaft ${c.name} ${c.shortName}`}
                        icon={<Users />}
                        onSelect={() => geh(() => setGesellschaft(c.id))}
                        titel={c.name}
                        sub="Als Filter setzen"
                      />
                    ))}
                  </Gruppe>
                  <Gruppe titel="Objekte">
                    {daten.properties.map((p) => (
                      <Eintrag
                        key={p.id}
                        value={`Objekt ${p.id} ${p.name} ${p.street} ${p.city}`}
                        icon={<Building2 />}
                        onSelect={() =>
                          geh(() =>
                            navigate({
                              to: "/board/immobilien",
                              search: { objekt: p.id },
                            }),
                          )
                        }
                        titel={`${p.name}`}
                        sub={`${p.id} · ${p.street}, ${p.city}`}
                      />
                    ))}
                  </Gruppe>
                  <Gruppe titel="Darlehen">
                    {daten.loans.map((l) => (
                      <Eintrag
                        key={l.id}
                        value={`Darlehen ${l.id} ${l.bankRef ?? ""} ${name(l.lenderCompanyId, l.lenderPartyId)} ${name(l.borrowerCompanyId, l.borrowerPartyId)} ${l.purpose}`}
                        icon={<Landmark />}
                        onSelect={() =>
                          geh(() =>
                            navigate({
                              to: "/board/darlehen",
                              search: { darlehen: l.id },
                            }),
                          )
                        }
                        titel={`${l.id} · ${l.purpose}`}
                        sub={`${name(l.lenderCompanyId, l.lenderPartyId)} → ${name(l.borrowerCompanyId, l.borrowerPartyId)} · ${euroKompakt(l.principal)}`}
                      />
                    ))}
                  </Gruppe>
                  <Gruppe titel="Mieter">
                    {daten.leases.map((l) => {
                      const t = daten.tenants.find((x) => x.id === l.tenantId);
                      const u = daten.units.find((x) => x.id === l.unitId);
                      const p = daten.properties.find(
                        (x) => x.id === u?.propertyId,
                      );
                      return (
                        <Eintrag
                          key={l.id}
                          value={`Mieter ${t?.name} ${p?.name} ${u?.label}`}
                          icon={<User />}
                          onSelect={() =>
                            geh(() =>
                              navigate({
                                to: "/board/immobilien",
                                search: { objekt: p?.id, mietvertrag: l.id },
                              }),
                            )
                          }
                          titel={t?.name ?? "–"}
                          sub={`${p?.name} · ${u?.label}`}
                        />
                      );
                    })}
                  </Gruppe>
                </>
              ) : null}
            </Command.List>
            <div className="flex items-center gap-3 border-t border-hairline px-4 py-2 text-xs text-text-subtle">
              <span className="flex items-center gap-1">
                <Taste>↑</Taste>
                <Taste>↓</Taste> auswählen
              </span>
              <span className="flex items-center gap-1">
                <Taste>
                  <CornerDownLeft className="size-3" />
                </Taste>
                öffnen
              </span>
            </div>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Gruppe({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <Command.Group
      heading={titel}
      className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-text-subtle"
    >
      {children}
    </Command.Group>
  );
}

function Eintrag({
  value,
  icon,
  titel,
  sub,
  rechts,
  onSelect,
}: {
  value: string;
  icon: ReactNode;
  titel: string;
  sub?: string;
  rechts?: ReactNode;
  onSelect: () => void;
}) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-3 px-2.5 py-2 text-sm text-foreground data-[selected=true]:bg-surface-muted [&_svg]:size-4 [&_svg]:text-text-muted"
    >
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block truncate">{titel}</span>
        {sub ? (
          <span className="block truncate text-xs text-text-subtle">{sub}</span>
        ) : null}
      </span>
      {rechts}
    </Command.Item>
  );
}

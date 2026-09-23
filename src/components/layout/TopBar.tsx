import { Bell, LogOut, Search } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { Breadcrumb } from "./Breadcrumb";
import { OpAdminEinstellungen } from "@/components/op-admin/OpAdminEinstellungen";
import { useAuth } from "@/hooks/useAuth";
import { APP_NAME, ROLLEN } from "@/lib/constants";
import { istOpAdmin } from "@/lib/op-admin";

export function TopBar() {
  const { benutzer, abmelden } = useAuth();
  const navigate = useNavigate();
  if (!benutzer) return null;

  const initialen = benutzer.initialen;
  const rolleKey = benutzer.rollen[0]?.rolle;
  const rolle = rolleKey ? (ROLLEN[rolleKey]?.bezeichnung ?? rolleKey) : "";
  const name = benutzer.name;
  const zeigtOpAdmin = istOpAdmin(benutzer.email);

  async function onAbmelden() {
    await abmelden();
    await navigate({ to: "/anmelden", replace: true });
  }

  return (
    <header className="hairline-b sticky top-0 z-40 flex h-16 items-stretch border-b border-hairline bg-surface">
      <div className="hairline-r flex w-60 items-center gap-2 border-r border-hairline px-6">
        <span
          data-op-zensur-ziel=""
          className="text-sm font-bold uppercase tracking-[0.14em] text-heading"
        >
          {APP_NAME}
        </span>
      </div>
      <div className="hidden flex-1 items-center px-6 md:flex">
        <Breadcrumb />
      </div>
      <div className="ml-auto flex items-center gap-1 pr-4">
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center hover:bg-surface-muted"
          aria-label="Suche"
        >
          <Search className="h-4 w-4 text-text-muted" strokeWidth={1.5} />
        </button>
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center hover:bg-surface-muted"
          aria-label="Benachrichtigungen"
        >
          <Bell className="h-4 w-4 text-text-muted" strokeWidth={1.5} />
        </button>
        {zeigtOpAdmin ? <OpAdminEinstellungen /> : null}
        <div className="ml-2 flex items-center gap-3 border-l border-hairline pl-4">
          <div
            data-op-zensur-ziel=""
            className="flex h-9 w-9 items-center justify-center bg-primary text-xs font-semibold uppercase text-primary-foreground"
          >
            {initialen}
          </div>
          <div data-op-zensur-ziel="" className="hidden flex-col md:flex">
            <span className="text-sm font-medium text-heading">{name}</span>
            <span className="label-caps text-text-subtle">{rolle}</span>
          </div>
          <button
            type="button"
            onClick={onAbmelden}
            className="flex h-10 w-10 items-center justify-center hover:bg-surface-muted"
            aria-label="Abmelden"
            title="Abmelden"
          >
            <LogOut className="h-4 w-4 text-text-muted" strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </header>
  );
}

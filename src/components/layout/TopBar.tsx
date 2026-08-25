import { Bell, LogOut, Search } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { GesellschaftSwitcher } from "./GesellschaftSwitcher";
import { Breadcrumb } from "./Breadcrumb";
import { useAuth } from "@/hooks/useAuth";
import { APP_NAME, ROLLEN } from "@/lib/constants";

export function TopBar() {
  const { benutzer, abmelden } = useAuth();
  const navigate = useNavigate();
  const initialen = benutzer?.initialen ?? "–";
  const rolleKey = benutzer?.rollen[0]?.rolle;
  const rolle = rolleKey ? ROLLEN[rolleKey].bezeichnung : "kein Login";
  const name = benutzer?.name ?? "Nicht angemeldet";

  async function onAbmelden() {
    await abmelden();
    await navigate({ to: "/anmelden" });
  }

  return (
    <header className="hairline-b sticky top-0 z-40 flex h-16 items-stretch border-b border-hairline bg-surface">
      <div className="hairline-r flex w-60 items-center gap-2 border-r border-hairline px-6">
        <span className="text-sm font-bold uppercase tracking-[0.14em] text-heading">
          {APP_NAME}
        </span>
      </div>
      <GesellschaftSwitcher />
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
        <div className="ml-2 flex items-center gap-3 border-l border-hairline pl-4">
          <div className="flex h-9 w-9 items-center justify-center bg-primary text-xs font-semibold uppercase text-primary-foreground">
            {initialen}
          </div>
          <div className="hidden flex-col md:flex">
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

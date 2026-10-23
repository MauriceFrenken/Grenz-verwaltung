import { LogOut } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { Breadcrumb } from "./Breadcrumb";
import { GrenzCoLogo } from "@/components/marke/GrenzCoLogo";
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
    <header className="sticky top-0 z-40 flex h-16 items-stretch border-b border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex w-60 items-center justify-center gap-2 border-r border-sidebar-border px-5">
        <span
          data-op-zensur-ziel=""
          className="flex items-center gap-2.5"
          aria-label={APP_NAME}
        >
          <GrenzCoLogo className="h-10" />
        </span>
      </div>
      <div className="hidden flex-1 items-center px-6 text-sidebar-foreground/80 md:flex [&_a]:text-sidebar-foreground/70 [&_a:hover]:text-sidebar-foreground [&_span]:text-sidebar-foreground">
        <Breadcrumb />
      </div>
      <div className="ml-auto flex items-center gap-1 pr-4">
        {zeigtOpAdmin ? <OpAdminEinstellungen /> : null}
        <div className="ml-2 flex items-center gap-3 border-l border-sidebar-border pl-4">
          <div
            data-op-zensur-ziel=""
            className="flex h-9 w-9 items-center justify-center rounded-full bg-sidebar-foreground text-xs font-semibold uppercase text-sidebar"
          >
            {initialen}
          </div>
          <div data-op-zensur-ziel="" className="hidden flex-col md:flex">
            <span className="text-sm font-medium text-sidebar-foreground">{name}</span>
            <span className="label-caps text-sidebar-foreground/55">{rolle}</span>
          </div>
          <button
            type="button"
            onClick={onAbmelden}
            className="flex h-10 w-10 items-center justify-center hover:bg-sidebar-accent"
            aria-label="Abmelden"
            title="Abmelden"
          >
            <LogOut className="h-4 w-4 text-sidebar-foreground/70" strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </header>
  );
}

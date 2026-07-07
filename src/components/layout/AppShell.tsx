import type { ReactNode } from "react";
import { useEffect } from "react";
import { TopBar } from "./TopBar";
import { Sidebar } from "./Sidebar";
import { einstellungenApi } from "@/api/einstellungen";
import { useMandantStore } from "@/store/mandant";

export function AppShell({ children }: { children: ReactNode }) {
  const setMandanten = useMandantStore((s) => s.setMandanten);

  useEffect(() => {
    einstellungenApi
      .listMandanten()
      .then(({ items }) => setMandanten(items))
      .catch((err) => console.error("Mandanten konnten nicht geladen werden", err));
  }, [setMandanten]);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <TopBar />
      <div className="flex flex-1">
        <Sidebar />
        <main className="relative z-0 min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
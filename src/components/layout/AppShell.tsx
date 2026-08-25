import type { ReactNode } from "react";
import { useEffect } from "react";
import { TopBar } from "./TopBar";
import { Sidebar } from "./Sidebar";
import { verwaltungApi } from "@/api/verwaltung";
import { useGesellschaftStore } from "@/store/gesellschaft";

export function AppShell({ children }: { children: ReactNode }) {
  const setGesellschaften = useGesellschaftStore((s) => s.setGesellschaften);

  useEffect(() => {
    verwaltungApi
      .listGesellschaften()
      .then(({ items }) => setGesellschaften(items))
      .catch((err) => console.error("Gesellschaften konnten nicht geladen werden", err));
  }, [setGesellschaften]);

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
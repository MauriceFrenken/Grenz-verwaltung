import type { ReactNode } from "react";

import { useGraphCachePrefetch } from "@/hooks/useGraphCachePrefetch";

import { TopBar } from "./TopBar";
import { Sidebar } from "./Sidebar";

export function AppShell({ children }: { children: ReactNode }) {
  useGraphCachePrefetch();

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

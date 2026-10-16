import type { ReactNode } from "react";
import { GrenzCoLogo } from "@/components/marke/GrenzCoLogo";

interface AuthShellProps {
  title: string;
  description?: string;
  children: ReactNode;
}

export function AuthShell({ title, description, children }: AuthShellProps) {
  return (
    <div className="flex min-h-screen bg-background">
      <aside className="relative hidden w-[46%] shrink-0 flex-col overflow-hidden bg-sidebar px-10 py-10 text-sidebar-foreground lg:flex xl:w-[48%] xl:px-14">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          aria-hidden
          style={{
            backgroundImage:
              "linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />

        <div data-op-zensur-ziel="" className="relative z-10">
          <span className="font-display text-2xl font-semibold tracking-tight">
            G
          </span>
        </div>

        <div
          data-op-zensur-ziel=""
          className="relative z-10 flex flex-1 flex-col justify-center"
        >
          <h1 className="m-0">
            <GrenzCoLogo className="h-auto w-full max-w-[18rem] xl:max-w-[22rem]" />
          </h1>
          <div className="mt-8 h-px w-12 bg-sidebar-foreground/25" />
        </div>
      </aside>

      <main className="relative flex flex-1 flex-col">
        <div
          data-op-zensur-ziel=""
          className="flex items-center gap-3 border-b border-sidebar-border bg-sidebar px-6 py-4 lg:hidden"
        >
          <GrenzCoLogo className="h-7 w-auto" />
        </div>

        <div className="flex flex-1 items-center justify-center px-6 py-12 sm:px-10">
          <div className="w-full max-w-[22rem]">
            <h2 className="text-2xl font-semibold tracking-tight text-heading">
              {title}
            </h2>
            {description ? (
              <p className="mt-2 mb-8 text-sm text-text-muted">{description}</p>
            ) : (
              <div className="mb-10" />
            )}
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}

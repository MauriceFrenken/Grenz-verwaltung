import type { ReactNode } from "react";

/** Monogram: light tile on dark panels so the F stays legible. */
function BrandMark({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      aria-hidden
      focusable="false"
    >
      <rect width="32" height="32" fill="#fff" />
      <rect x="8" y="7" width="5" height="18" fill="#0A0A0A" />
      <rect x="8" y="7" width="16" height="5" fill="#0A0A0A" />
      <rect x="8" y="14" width="12" height="5" fill="#0A0A0A" />
    </svg>
  );
}

/** Abstract facade — vertical rhythm of a property portfolio. */
function FacadePattern() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      <div className="absolute inset-y-0 right-0 flex w-[58%] items-end justify-end gap-px pr-0">
        {[
          { h: "42%", o: 0.06 },
          { h: "68%", o: 0.1 },
          { h: "54%", o: 0.07 },
          { h: "88%", o: 0.12 },
          { h: "62%", o: 0.08 },
          { h: "76%", o: 0.1 },
          { h: "48%", o: 0.06 },
        ].map((col, i) => (
          <div
            key={i}
            className="relative flex-1 bg-white"
            style={{ height: col.h, opacity: col.o }}
          >
            <div
              className="absolute inset-x-2 top-4 bottom-4 opacity-40"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(to bottom, transparent, transparent 10px, #fff 10px, #fff 11px)",
              }}
            />
          </div>
        ))}
      </div>
      <div className="absolute bottom-0 left-0 h-1 w-24 bg-white" />
    </div>
  );
}

interface AuthShellProps {
  title: string;
  description?: string;
  children: ReactNode;
}

export function AuthShell({ title, description, children }: AuthShellProps) {
  return (
    <div className="flex min-h-screen bg-background">
      <aside className="relative hidden w-[46%] shrink-0 flex-col overflow-hidden bg-heading px-10 py-10 text-primary-foreground lg:flex xl:w-[48%] xl:px-14">
        <FacadePattern />

        <div className="relative z-10">
          <BrandMark className="size-10" />
        </div>

        <div className="relative z-10 flex flex-1 flex-col justify-center">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.22em] text-white/45">
            FRENKEN
          </p>
          <h1 className="mt-4 text-[2.75rem] font-semibold leading-[1.05] tracking-tight text-white">
            Verwaltung
          </h1>
          <div className="mt-8 h-px w-12 bg-white/25" />
        </div>
      </aside>

      <main className="relative flex flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-hairline bg-heading px-6 py-4 text-primary-foreground lg:hidden">
          <BrandMark className="size-8" />
          <div>
            <p className="text-[0.625rem] font-semibold uppercase tracking-[0.18em] text-white/50">
              FRENKEN
            </p>
            <p className="text-sm font-semibold tracking-tight text-white">Verwaltung</p>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center px-6 py-12 sm:px-10">
          <div className="w-full max-w-[22rem]">
            <h2 className="text-2xl font-semibold tracking-tight text-heading">{title}</h2>
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

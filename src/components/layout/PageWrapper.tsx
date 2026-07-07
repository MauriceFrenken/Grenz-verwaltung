import type { ReactNode } from "react";

export function PageWrapper({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-6 px-8 py-6">{children}</div>;
}

export function ContentSection({
  titel,
  aktion,
  children,
}: {
  titel?: string;
  aktion?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      {(titel || aktion) && (
        <div className="flex items-center justify-between">
          {titel ? <h2 className="label-caps text-text-muted">{titel}</h2> : <span />}
          {aktion}
        </div>
      )}
      {children}
    </section>
  );
}
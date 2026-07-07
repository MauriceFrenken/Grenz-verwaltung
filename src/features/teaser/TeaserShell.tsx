import type { ReactNode } from "react";
import { EntwicklungOverlay } from "@/components/shared/EntwicklungOverlay";

export function TeaserShell({ children }: { children: ReactNode }) {
  return <EntwicklungOverlay>{children}</EntwicklungOverlay>;
}

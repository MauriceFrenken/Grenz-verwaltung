import { useEffect } from "react";
import { useOpAdminStore } from "@/store/op-admin";

/** Schreibt den Zensur-Status auf `<html>` für globale CSS-Filter. */
export function OpAdminZensurSync() {
  const zensurAktiv = useOpAdminStore((s) => s.zensurAktiv);
  const hydrate = useOpAdminStore((s) => s.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    document.documentElement.dataset.opZensur = zensurAktiv ? "true" : "false";
    return () => {
      delete document.documentElement.dataset.opZensur;
    };
  }, [zensurAktiv]);

  return null;
}

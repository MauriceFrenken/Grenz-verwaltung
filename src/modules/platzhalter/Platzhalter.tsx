import { Hammer } from "lucide-react";
import { SeitenKopf } from "@/components/board/Layout";
import { Leerzustand } from "@/components/board/Leerzustand";

export function Platzhalter({ titel }: { titel: string }) {
  return (
    <>
      <SeitenKopf titel={titel} />
      <Leerzustand
        icon={Hammer}
        titel="In Arbeit"
        text="Diese Seite folgt im nächsten Meilenstein."
      />
    </>
  );
}

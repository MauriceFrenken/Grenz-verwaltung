/**
 * Ordnet Salesforce-Aktivitäten Akquise-Maßnahmen zu. Grenz pflegt kaum Aufgabentypen,
 * die Art steckt im Betreff („Send Letter“, „kein Schreiben geschickt – Miteigentümer
 * kontaktiert“, „Call“, „Objektaufnahme“, „Wiedervorlage: …“).
 */

import type {
  Bereich,
  Ergebnis,
  Massnahme,
  RohAufgabe,
  RohPerson,
} from "./typen";

export const MASSNAHME_LABEL: Record<Massnahme, string> = {
  anschreiben: "Anschreiben",
  kein_anschreiben: "Bewusst nicht angeschrieben",
  retoure: "Brief-Retoure",
  rueckmeldung: "Rückmeldung",
  anruf: "Anruf",
  email: "E-Mail",
  nachfassen: "Nachfassen / Wiedervorlage",
  proaktiv: "Proaktive Akquise",
  akquise_termin: "Objektaufnahme / Einwertung",
  besichtigung: "Besichtigung",
  sonstiges: "Sonstiges",
};

/** Reihenfolge in Diagrammen und Tabellen. */
export const MASSNAHMEN_REIHENFOLGE: Massnahme[] = [
  "anschreiben",
  "anruf",
  "email",
  "nachfassen",
  "proaktiv",
  "akquise_termin",
  "rueckmeldung",
  "besichtigung",
  "kein_anschreiben",
  "retoure",
  "sonstiges",
];

export const LEAD_STATUS_LABEL: Record<string, string> = {
  Open: "Offen",
  "Desktop Research finalized": "Desktop-Recherche fertig",
  "Onsite Research finalized": "Vor-Ort-Recherche fertig",
  "Co-owners already contacted": "Miteigentümer kontaktiert",
  "First contact": "Erstkontakt",
  Unqualified: "Abgelehnt",
  Nurturing: "In Pflege",
  Qualified: "Qualifiziert",
};

export function leadStatusLabel(status: string | null): string {
  if (!status) return "ohne Status";
  return LEAD_STATUS_LABEL[status] ?? status;
}

export const ERGEBNIS_LABEL: Record<Ergebnis, string> = {
  mandat: "Konvertiert (Kontakt/Mandat)",
  interesse: "Interesse / qualifiziert",
  kontakt: "Erstkontakt",
  absage: "Absage durch Eigentümer",
  erstkontakt: "Status Erstkontakt, ohne vermerkte Antwort",
  aussortiert: "Aussortiert (Einfamilienhaus, Makler)",
  miteigentuemer: "Über Miteigentümer kontaktiert",
  retoure: "Brief kam zurück",
  keine: "Keine Reaktion",
};

export function klassifiziere(
  a: Pick<RohAufgabe, "betreff" | "subtyp" | "typ"> & {
    wer?: RohAufgabe["wer"];
  },
): Massnahme {
  const b = a.betreff.toLowerCase().trim();
  if (
    /kein(en|e)?\s+(an)?schreiben|kein(en)?\s+brief|schreiben nicht (ver)?schickt|nicht anschreiben/.test(
      b,
    )
  )
    return "kein_anschreiben";
  if (
    /^send letter|anschreiben (versandt|verschickt|gesendet)|brief (versandt|verschickt)|^akquisebrief/.test(
      b,
    )
  )
    return "anschreiben";
  if (/kam zur(ü|ue)ck|retoure|unzustellbar|empf(ä|ae)nger unbekannt/.test(b))
    return "retoure";
  if (
    /antwortschreiben|anruf eingehend|eingehender anruf|hat sich (zur(ü|ue)ck)?gemeldet|r(ü|ue)ckmeldung erhalten/.test(
      b,
    )
  )
    return "rueckmeldung";
  if (/besichtigung/.test(b)) return "besichtigung";
  if (
    /objektaufnahme|einwertung|werteinsch(ä|ae)tzung|termin vor ort|akquisetermin|bewertungstermin/.test(
      b,
    )
  )
    return "akquise_termin";
  if (
    /wiedervorlage|nachfrag|nachfass|wie (sieht|schaut)|wie siehts|wenn keine r(ü|ue)ckmeldung|wie der stand|speku/.test(
      b,
    )
  )
    return "nachfassen";
  if (/proaktiv|akquise/.test(b)) return "proaktiv";
  if (
    a.subtyp === "Call" ||
    /^(call|anruf|anrufen|telefonat|telefon)\b/.test(b)
  )
    return "anruf";
  if (
    a.subtyp === "Email" ||
    a.subtyp === "ListEmail" ||
    /^(e-mail|email|send e-mail|mail)\b/.test(b)
  ) {
    // Antworten eines angeschriebenen Eigentümers zählen als Rückmeldung.
    if (
      a.wer?.typ === "Lead" &&
      (/^e-mail:\s*(aw|re)\s*:/.test(b) || /ihr schreiben/.test(b))
    )
      return "rueckmeldung";
    return "email";
  }
  if (a.typ === "Event") return "akquise_termin";
  return "sonstiges";
}

/** Akquise = Verkäuferseite (Eigentümer-Leads, Anschreiben, Einwertung); Vermarktung = Käuferseite. */
export function bereichVon(a: RohAufgabe, massnahme: Massnahme): Bereich {
  if (massnahme === "besichtigung") return "vermarktung";
  if (
    a.wer?.typ === "Lead" ||
    [
      "anschreiben",
      "kein_anschreiben",
      "retoure",
      "proaktiv",
      "akquise_termin",
    ].includes(massnahme)
  )
    return "akquise";
  const what = a.worauf?.typ;
  if (what === "Opportunity" || what === "Campaign") return "vermarktung";
  return "allgemein";
}

/** Stand eines angeschriebenen Eigentümer-Leads, aus Lead-Status und Folgeaktivitäten. */
/** Absagegründe aus der Recherche (Lead nicht ansprechen), keine Antwort des Eigentümers. */
export const AUSSORTIERT_GRUENDE = new Set([
  "Einfamilienhaus - KEINE ANSPRACHE",
  "ist selbst Makler",
]);

/**
 * Stand eines angeschriebenen Eigentümer-Leads. „First contact“ setzt Grenz meist ohne
 * vermerkte Antwort; als Reaktion zählt erst eine Rückmeldung, Qualifizierung oder Absage.
 */
export function ergebnisVon(
  person: RohPerson,
  massnahmenDanach: Set<Massnahme>,
): Ergebnis {
  if (person.konvertiert) return "mandat";
  const s = person.leadStatus ?? "";
  if (["Qualified", "Nurturing", "Wiedervorlage"].includes(s))
    return "interesse";
  if (["Unqualified", "Abgelehnt"].includes(s))
    return person.absagegrund && AUSSORTIERT_GRUENDE.has(person.absagegrund)
      ? "aussortiert"
      : "absage";
  if (massnahmenDanach.has("rueckmeldung")) return "kontakt";
  if (["First contact", "Erstkontakt"].includes(s)) return "erstkontakt";
  if (s === "Co-owners already contacted") return "miteigentuemer";
  if (massnahmenDanach.has("retoure")) return "retoure";
  return "keine";
}

export function istReaktion(e: Ergebnis): boolean {
  return (
    e === "mandat" || e === "interesse" || e === "kontakt" || e === "absage"
  );
}

/** Datum, an dem die Aktivität stattfand (erledigt, sonst erstellt). */
export function aktivitaetsDatum(a: RohAufgabe): string {
  return a.erledigtAm ?? a.erstelltAm;
}

export function istOffen(a: RohAufgabe): boolean {
  return a.typ === "Task" && a.status !== "Completed";
}

import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";

import { hatTextschicht, istKiAusfall } from "./quellen-lauf";
import { texteNeuDran } from "./typen";

function apiFehler(status: number, nachricht: string) {
  return Anthropic.APIError.generate(
    status,
    {
      type: "error",
      error: { type: "invalid_request_error", message: nachricht },
    },
    nachricht,
    new Headers(),
  );
}

describe("istKiAusfall", () => {
  it("erkennt leeres Guthaben, Überlastung und fehlenden Schlüssel", () => {
    expect(
      istKiAusfall(
        apiFehler(
          400,
          "Your credit balance is too low to access the Anthropic API.",
        ),
      ),
    ).toBe(true);
    expect(istKiAusfall(apiFehler(529, "Overloaded"))).toBe(true);
    expect(istKiAusfall(apiFehler(429, "rate limited"))).toBe(true);
    expect(
      istKiAusfall(new Error("ANTHROPIC_API_KEY ist nicht konfiguriert.")),
    ).toBe(true);
  });
  it("normale Fehler sind kein Ausfall", () => {
    expect(istKiAusfall(apiFehler(400, "prompt is too long"))).toBe(false);
    expect(istKiAusfall(new Error("HTTP 404"))).toBe(false);
  });
});

describe("hatTextschicht", () => {
  it("nimmt PDFs mit Text, nicht aber Scans", () => {
    expect(hatTextschicht(["x".repeat(1500), "y".repeat(1500)])).toBe(true);
    expect(hatTextschicht([])).toBe(false);
    expect(hatTextschicht(["", "", "Seite 3"])).toBe(false);
    expect(hatTextschicht(Array(40).fill("Abb. 1"))).toBe(false);
  });
});

describe("texteNeuDran", () => {
  const jetzt = new Date("2026-11-24T12:00:00Z");
  it("schreibt Texte höchstens alle 24 Stunden neu", () => {
    expect(texteNeuDran(undefined, jetzt)).toBe(true);
    expect(texteNeuDran("2026-11-24T02:00:00Z", jetzt)).toBe(false);
    expect(texteNeuDran("2026-11-23T11:59:00Z", jetzt)).toBe(true);
  });
});

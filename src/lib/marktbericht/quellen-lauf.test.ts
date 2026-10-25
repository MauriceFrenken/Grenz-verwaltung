import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";

import { istKiAusfall } from "./quellen-lauf";

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

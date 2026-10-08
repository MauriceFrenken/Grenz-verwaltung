import { describe, expect, it } from "vitest";
import { countdown, countdownTage } from "./countdown";

describe("countdown", () => {
  const jetzt = new Date(2026, 9, 8, 20, 0); // 08.10.2026 20:00 Ortszeit

  it("zeigt Tage und Stunden bis zum Tagesbeginn", () => {
    const c = countdown("2026-10-12", jetzt);
    expect(c.text).toBe("3 T 04 Std");
    expect(c.tage).toBe(3);
    expect(c.dringend).toBe(true);
    expect(c.ueberfaellig).toBe(false);
  });

  it("zeigt Stunden und Minuten unter einem Tag", () => {
    expect(countdown("2026-10-09", new Date(2026, 9, 8, 21, 15)).text).toBe(
      "2 Std 45 Min",
    );
  });

  it("gilt am Fälligkeitstag als heute", () => {
    const c = countdown("2026-10-08", jetzt);
    expect(c.text).toBe("heute");
    expect(c.ueberfaellig).toBe(false);
  });

  it("meldet überfällige Termine", () => {
    const c = countdown("2026-10-01", jetzt);
    expect(c.text).toBe("seit 7 T");
    expect(c.ueberfaellig).toBe(true);
    expect(c.tage).toBe(-7);
  });

  it("zeigt ab einer Woche nur ganze Tage", () => {
    expect(countdown("2026-10-20", jetzt).text).toBe("11 T");
  });

  it("kürzt lange Fristen auf Tage", () => {
    const c = countdown("2027-03-31", jetzt);
    expect(c.text).toBe("173 T");
    expect(c.dringend).toBe(false);
  });
});

describe("countdownTage", () => {
  it("rechnet ganze Tage ab Stichtag", () => {
    expect(countdownTage("2026-10-15", "2026-10-08").text).toBe("7 T");
    expect(countdownTage("2026-10-08", "2026-10-08").text).toBe("heute");
    expect(countdownTage("2026-10-05", "2026-10-08")).toMatchObject({
      text: "seit 3 T",
      ueberfaellig: true,
    });
  });
});

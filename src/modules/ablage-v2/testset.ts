import { z } from "zod";
import { DOKUMENTTYPEN, mailSchema } from "@/lib/ai/klassifikation";
import roh from "../../../docs/testdaten/ablage-testset.json?raw";
import type { Erwartung } from "./logik/ablage";

const testsetSchema = z.object({
  beschreibung: z.string(),
  mails: z.array(
    mailSchema.extend({
      erwartet: z.object({
        gesellschaft: z.string().nullable(),
        dokumenttyp: z.enum(DOKUMENTTYPEN),
        bezugId: z.string().nullable(),
        ordner: z.string(),
      }),
    }),
  ),
});

/** 30 fiktive Eingangs-Mails (docs/testdaten/ablage-testset.json). */
export const ABLAGE_TESTSET = testsetSchema.parse(JSON.parse(roh));

export const ABLAGE_MAILS = ABLAGE_TESTSET.mails.map(
  ({ erwartet: _e, ...mail }) => mail,
);

export const ABLAGE_ERWARTUNGEN = new Map<string, Erwartung>(
  ABLAGE_TESTSET.mails.map((m) => [m.id, m.erwartet]),
);

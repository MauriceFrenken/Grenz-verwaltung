/**
 * Abgleich Aufgabenboard ↔ Trello-Board in beide Richtungen.
 *
 * Läuft nach jeder Änderung in der App, beim Öffnen des Boards (höchstens alle 20 s), bei jedem
 * Trello-Webhook und nachts per Cron. Jeder Lauf liest das ganze Trello-Board (zwei Abrufe)
 * und vergleicht je Spalte und Karte gegen den zuletzt abgeglichenen Stand (trello_hash):
 * Was nur auf einer Seite geändert wurde, wird auf die andere übertragen; bei Änderungen auf
 * beiden Seiten gewinnt die jüngere. Läuft ein Lauf doppelt (Webhook + App), ist das harmlos:
 * Neuanlagen werden über trello_id gesperrt, alles andere ist idempotent.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  TrelloApi,
  trelloKonfig,
  type TrelloBoard,
  type TrelloKarte,
  type TrelloListe,
} from "./trello-api";
import {
  checkNorm,
  datumAusTrello,
  datumNachTrello,
  formHash,
  gewuenschteLabels,
  istVerwaltetesLabel,
  LABEL_PRIO_HOCH,
  LABEL_PRIO_NIEDRIG,
  posAusTrello,
  posNachTrello,
  prioAusLabels,
  richtung,
  rsAusLabels,
  textNorm,
  titelNorm,
  type KartenForm,
  type ListenForm,
} from "./trello-form";
import type { ChecklistenPunkt, Prioritaet, TrelloStatus } from "./typen";

export type AbgleichErgebnis = {
  nachTrello: number;
  ausTrello: number;
  neuInTrello: number;
  neuInApp: number;
};

type SpalteZeile = {
  id: string;
  titel: string;
  position: number;
  erledigt: boolean;
  trello_id: string | null;
  trello_hash: string | null;
  updated_at: string;
};

type AufgabeZeile = {
  id: string;
  spalte_id: string;
  position: number;
  titel: string;
  beschreibung: string;
  verantwortlich_id: string | null;
  faellig_am: string | null;
  prioritaet: Prioritaet;
  ruecksprache: string;
  checkliste: ChecklistenPunkt[] | null;
  archiviert: boolean;
  erledigt_am: string | null;
  trello_id: string | null;
  trello_hash: string | null;
  updated_at: string;
};

const SPERRE = "wartet:";
const SPERRE_MS = 2 * 60_000;
const NIE = "1970-01-01T00:00:00Z";

function gesperrt(trelloId: string | null): boolean {
  if (!trelloId?.startsWith(SPERRE)) return false;
  return Date.now() - Number(trelloId.slice(SPERRE.length)) < SPERRE_MS;
}

function listenForm(name: string, pos: number): ListenForm {
  return { name: name.trim().slice(0, 80), pos };
}

class Abgleich {
  readonly ergebnis: AbgleichErgebnis = {
    nachTrello: 0,
    ausTrello: 0,
    neuInTrello: 0,
    neuInApp: 0,
  };
  private labelIdVon = new Map<string, string>();
  private labelNameVon = new Map<string, string>();
  private mitgliedVonProfil = new Map<string, string>();
  private profilVonMitglied = new Map<string, string>();
  private spalteVonListe = new Map<string, SpalteZeile>();
  private spalteVonId = new Map<string, SpalteZeile>();
  private checklistenVon = new Map<string, TrelloBoard["checklists"]>();

  constructor(
    private readonly admin: SupabaseClient,
    private readonly api: TrelloApi,
    private readonly tb: TrelloBoard,
  ) {
    for (const l of tb.labels) {
      if (!l.name) continue;
      this.labelIdVon.set(l.name, l.id);
      this.labelNameVon.set(l.id, l.name);
    }
    for (const c of tb.checklists) {
      const liste = this.checklistenVon.get(c.idCard) ?? [];
      liste.push(c);
      this.checklistenVon.set(c.idCard, liste);
    }
  }

  async personen(): Promise<void> {
    const { data } = await this.admin.from("profiles").select("id, name");
    const mitglieder = new Map(
      this.tb.members.map((m) => [m.fullName.trim().toLowerCase(), m.id]),
    );
    for (const p of data ?? []) {
      const m = mitglieder.get(
        String(p.name ?? "")
          .trim()
          .toLowerCase(),
      );
      if (!m) continue;
      this.mitgliedVonProfil.set(String(p.id), m);
      this.profilVonMitglied.set(m, String(p.id));
    }
  }

  private async labelId(name: string): Promise<string> {
    const vorhanden = this.labelIdVon.get(name);
    if (vorhanden) return vorhanden;
    const farbe =
      name === LABEL_PRIO_HOCH
        ? "red"
        : name === LABEL_PRIO_NIEDRIG
          ? "sky"
          : "blue";
    const l = await this.api.rufe<{ id: string }>("POST", "/labels", {
      idBoard: this.tb.id,
      name,
      color: farbe,
    });
    this.labelIdVon.set(name, l.id);
    this.labelNameVon.set(l.id, name);
    return l.id;
  }

  // --- Spalten ↔ Listen -----------------------------------------------------

  async spalten(): Promise<void> {
    const { data, error } = await this.admin
      .from("aufgaben_spalten")
      .select(
        "id, titel, position, erledigt, trello_id, trello_hash, updated_at",
      )
      .order("position");
    if (error) throw new Error(error.message);
    const spalten = (data ?? []) as SpalteZeile[];
    const offen = new Map(this.tb.lists.map((l) => [l.id, l]));
    const verknuepft = new Set(spalten.map((s) => s.trello_id).filter(Boolean));

    for (const s of spalten) {
      const liste = s.trello_id ? offen.get(s.trello_id) : undefined;
      if (liste) {
        await this.spalteAbgleichen(s, liste);
      } else if (
        s.trello_id &&
        !gesperrt(s.trello_id) &&
        !s.trello_id.startsWith(SPERRE)
      ) {
        // Liste in Trello archiviert oder gelöscht: leere Spalte entfernen, sonst neu anlegen.
        if (await this.spalteEntfernen(s)) continue;
        await this.listeAnlegen(s, s.trello_id);
      } else if (!gesperrt(s.trello_id)) {
        const gleichnamig = this.tb.lists.find(
          (l) => !verknuepft.has(l.id) && l.name.trim() === s.titel.trim(),
        );
        if (gleichnamig) {
          verknuepft.add(gleichnamig.id);
          s.trello_id = gleichnamig.id;
          await this.admin
            .from("aufgaben_spalten")
            .update({ trello_id: gleichnamig.id })
            .eq("id", s.id);
          await this.spalteAbgleichen(s, gleichnamig);
        } else {
          await this.listeAnlegen(s, s.trello_id);
        }
      }
      if (s.trello_id && !s.trello_id.startsWith(SPERRE)) {
        this.spalteVonListe.set(s.trello_id, s);
        this.spalteVonId.set(s.id, s);
      }
    }

    for (const l of this.tb.lists) {
      if (verknuepft.has(l.id) || this.spalteVonListe.has(l.id)) continue;
      const form = listenForm(l.name, Math.round(l.pos));
      const { data: neu } = await this.admin
        .from("aufgaben_spalten")
        .upsert(
          {
            titel: form.name || "Ohne Titel",
            position: posAusTrello(l.pos),
            trello_id: l.id,
            trello_hash: formHash(form),
          },
          { onConflict: "trello_id", ignoreDuplicates: true },
        )
        .select(
          "id, titel, position, erledigt, trello_id, trello_hash, updated_at",
        );
      const s = (neu?.[0] as SpalteZeile | undefined) ?? null;
      if (s) {
        this.spalteVonListe.set(l.id, s);
        this.spalteVonId.set(s.id, s);
        this.ergebnis.neuInApp++;
      }
    }
  }

  private async spalteAbgleichen(
    s: SpalteZeile,
    l: TrelloListe,
  ): Promise<void> {
    const app = listenForm(s.titel, posNachTrello(s.position));
    const trello = listenForm(l.name, Math.round(l.pos));
    const r = richtung(
      formHash(app),
      formHash(trello),
      s.trello_hash,
      s.updated_at,
      NIE,
    );
    if (r === "nach_trello") {
      await this.api.rufe("PUT", `/lists/${l.id}`, {
        name: app.name,
        pos: app.pos,
      });
      this.ergebnis.nachTrello++;
    } else if (r === "aus_trello" && trello.name) {
      s.titel = trello.name;
      s.position = posAusTrello(l.pos);
      await this.admin
        .from("aufgaben_spalten")
        .update({ titel: s.titel, position: s.position })
        .eq("id", s.id);
      this.ergebnis.ausTrello++;
    }
    const hash = formHash(r === "aus_trello" ? trello : app);
    if (hash !== s.trello_hash) {
      s.trello_hash = hash;
      await this.admin
        .from("aufgaben_spalten")
        .update({ trello_hash: hash })
        .eq("id", s.id);
    }
  }

  private async listeAnlegen(
    s: SpalteZeile,
    bisher: string | null,
  ): Promise<void> {
    const sperre = `${SPERRE}${Date.now()}`;
    let q = this.admin
      .from("aufgaben_spalten")
      .update({ trello_id: sperre })
      .eq("id", s.id);
    q = bisher === null ? q.is("trello_id", null) : q.eq("trello_id", bisher);
    const { data } = await q.select("id");
    if (!data?.length) return;
    const form = listenForm(s.titel, posNachTrello(s.position));
    const l = await this.api.rufe<TrelloListe>("POST", "/lists", {
      idBoard: this.tb.id,
      name: form.name,
      pos: form.pos,
    });
    s.trello_id = l.id;
    s.trello_hash = formHash(form);
    await this.admin
      .from("aufgaben_spalten")
      .update({ trello_id: l.id, trello_hash: s.trello_hash })
      .eq("id", s.id);
    this.ergebnis.neuInTrello++;
  }

  private async spalteEntfernen(s: SpalteZeile): Promise<boolean> {
    const { count } = await this.admin
      .from("aufgaben")
      .select("id", { count: "exact", head: true })
      .eq("spalte_id", s.id)
      .eq("archiviert", false);
    if ((count ?? 0) > 0) return false;
    const { data: andere } = await this.admin
      .from("aufgaben_spalten")
      .select("id")
      .neq("id", s.id)
      .order("position")
      .limit(1);
    if (!andere?.[0]) return false;
    await this.admin
      .from("aufgaben")
      .update({ spalte_id: andere[0].id })
      .eq("spalte_id", s.id);
    await this.admin.from("aufgaben_spalten").delete().eq("id", s.id);
    this.ergebnis.ausTrello++;
    return true;
  }

  // --- Karten ---------------------------------------------------------------

  private appForm(a: AufgabeZeile): KartenForm | null {
    const liste = this.spalteVonId.get(a.spalte_id)?.trello_id;
    if (!liste) return null;
    return {
      titel: titelNorm(a.titel),
      beschreibung: textNorm(a.beschreibung),
      faellig: a.faellig_am,
      liste,
      pos: posNachTrello(a.position),
      mitglied:
        (a.verantwortlich_id &&
          this.mitgliedVonProfil.get(a.verantwortlich_id)) ||
        null,
      prio: a.prioritaet,
      rs: a.ruecksprache.trim().slice(0, 200),
      check: checkNorm(a.checkliste ?? []),
    };
  }

  private trelloForm(c: TrelloKarte): KartenForm {
    const labels = c.idLabels.map((id) => this.labelNameVon.get(id) ?? "");
    const punkte = (this.checklistenVon.get(c.id) ?? [])
      .flatMap((cl) => [...cl.checkItems].sort((x, y) => x.pos - y.pos))
      .map((i) => ({ text: i.name, erledigt: i.state === "complete" }));
    return {
      titel: titelNorm(c.name),
      beschreibung: textNorm(c.desc ?? ""),
      faellig: datumAusTrello(c.due),
      liste: c.idList,
      pos: Math.round(c.pos),
      mitglied: c.idMembers.find((m) => this.profilVonMitglied.has(m)) ?? null,
      prio: prioAusLabels(labels),
      rs: rsAusLabels(labels),
      check: checkNorm(punkte),
    };
  }

  async karten(): Promise<void> {
    const { data, error } = await this.admin
      .from("aufgaben")
      .select(
        "id, spalte_id, position, titel, beschreibung, verantwortlich_id, faellig_am, prioritaet, ruecksprache, checkliste, archiviert, erledigt_am, trello_id, trello_hash, updated_at",
      )
      .limit(5000);
    if (error) throw new Error(error.message);
    const aufgaben = (data ?? []) as AufgabeZeile[];
    const offen = new Map(this.tb.cards.map((c) => [c.id, c]));
    const verknuepft = new Set(
      aufgaben.map((a) => a.trello_id).filter(Boolean),
    );

    for (const a of aufgaben) {
      const karte = a.trello_id ? offen.get(a.trello_id) : undefined;
      if (a.archiviert) {
        if (!karte) continue;
        if (formHash(this.trelloForm(karte)) === a.trello_hash) {
          await this.api.rufe("PUT", `/cards/${karte.id}`, { closed: true });
          this.ergebnis.nachTrello++;
        } else {
          // In Trello nach dem Archivieren wieder bearbeitet: zurück aufs Board.
          await this.holen(a, karte, { archiviert: false });
        }
        continue;
      }
      const app = this.appForm(a);
      if (!app) continue;
      if (karte) {
        const trello = this.trelloForm(karte);
        const r = richtung(
          formHash(app),
          formHash(trello),
          a.trello_hash,
          a.updated_at,
          karte.dateLastActivity,
        );
        if (r === "nach_trello") await this.senden(a, app, karte);
        else if (r === "aus_trello") await this.holen(a, karte);
        else if (a.trello_hash !== formHash(app)) {
          await this.admin
            .from("aufgaben")
            .update({ trello_hash: formHash(app) })
            .eq("id", a.id);
        }
      } else if (a.trello_id && !a.trello_id.startsWith(SPERRE)) {
        // In Trello archiviert oder gelöscht.
        await this.admin
          .from("aufgaben")
          .update({ archiviert: true })
          .eq("id", a.id);
        this.ergebnis.ausTrello++;
      } else if (!gesperrt(a.trello_id)) {
        const sperre = `${SPERRE}${Date.now()}`;
        let q = this.admin
          .from("aufgaben")
          .update({ trello_id: sperre })
          .eq("id", a.id);
        q =
          a.trello_id === null
            ? q.is("trello_id", null)
            : q.eq("trello_id", a.trello_id);
        const { data: frei } = await q.select("id");
        if (frei?.length) await this.senden(a, app, null);
      }
    }

    for (const c of this.tb.cards) {
      if (verknuepft.has(c.id) || !this.spalteVonListe.has(c.idList)) continue;
      await this.holen(null, c);
    }
  }

  private async senden(
    a: AufgabeZeile,
    form: KartenForm,
    karte: TrelloKarte | null,
  ): Promise<void> {
    const fremdeLabels = (karte?.idLabels ?? []).filter(
      (id) => !istVerwaltetesLabel(this.labelNameVon.get(id) ?? ""),
    );
    const labels = [...fremdeLabels];
    for (const n of gewuenschteLabels(form)) labels.push(await this.labelId(n));
    const fremdeMitglieder = (karte?.idMembers ?? []).filter(
      (m) => !this.profilVonMitglied.has(m),
    );
    const werte = {
      name: form.titel,
      desc: form.beschreibung,
      due: datumNachTrello(form.faellig),
      idList: form.liste,
      pos: form.pos,
      idMembers: form.mitglied
        ? [...fremdeMitglieder, form.mitglied]
        : fremdeMitglieder,
      idLabels: labels,
    };
    // Beim Anlegen leere Felder weglassen; beim Ändern leeren "" die Felder in Trello.
    if (!karte) {
      if (!werte.idMembers.length)
        delete (werte as Partial<typeof werte>).idMembers;
      if (!werte.idLabels.length)
        delete (werte as Partial<typeof werte>).idLabels;
      if (!werte.due) delete (werte as Partial<typeof werte>).due;
    }
    const ziel = karte
      ? await this.api.rufe<TrelloKarte>("PUT", `/cards/${karte.id}`, werte)
      : await this.api.rufe<TrelloKarte>("POST", "/cards", werte);

    const bisher = karte ? this.trelloForm(karte).check : [];
    if (JSON.stringify(bisher) !== JSON.stringify(form.check)) {
      for (const cl of this.checklistenVon.get(ziel.id) ?? []) {
        await this.api.rufe("DELETE", `/checklists/${cl.id}`);
      }
      if (form.check.length) {
        const cl = await this.api.rufe<{ id: string }>("POST", "/checklists", {
          idCard: ziel.id,
          name: "Checkliste",
        });
        for (const [text, erledigt] of form.check) {
          await this.api.rufe("POST", `/checklists/${cl.id}/checkItems`, {
            name: text,
            checked: erledigt,
            pos: "bottom",
          });
        }
      }
    }

    await this.admin
      .from("aufgaben")
      .update({ trello_id: ziel.id, trello_hash: formHash(form) })
      .eq("id", a.id);
    if (karte) this.ergebnis.nachTrello++;
    else this.ergebnis.neuInTrello++;
  }

  private async holen(
    a: AufgabeZeile | null,
    karte: TrelloKarte,
    extra: Record<string, unknown> = {},
  ): Promise<void> {
    const spalte = this.spalteVonListe.get(karte.idList);
    if (!spalte) return;
    const form = this.trelloForm(karte);
    let verantwortlich: string | null;
    if (form.mitglied)
      verantwortlich = this.profilVonMitglied.get(form.mitglied) ?? null;
    else if (
      a?.verantwortlich_id &&
      !this.mitgliedVonProfil.has(a.verantwortlich_id)
    ) {
      // Person ohne Trello-Konto: in der App behalten.
      verantwortlich = a.verantwortlich_id;
    } else verantwortlich = null;

    const alteIds = new Map(
      (a?.checkliste ?? []).map((p) => [p.text.trim(), p.id]),
    );
    const checkliste: ChecklistenPunkt[] = form.check.map(
      ([text, erledigt]) => ({
        id: alteIds.get(text) ?? crypto.randomUUID(),
        text,
        erledigt,
      }),
    );

    const felder = {
      spalte_id: spalte.id,
      position: posAusTrello(karte.pos),
      titel: form.titel || "Ohne Titel",
      beschreibung: form.beschreibung,
      faellig_am: form.faellig,
      prioritaet: form.prio,
      ruecksprache: form.rs,
      verantwortlich_id: verantwortlich,
      checkliste,
      erledigt_am: spalte.erledigt
        ? (a?.erledigt_am ?? new Date().toISOString())
        : null,
      trello_hash: formHash(form),
      ...extra,
    };
    if (a) {
      await this.admin.from("aufgaben").update(felder).eq("id", a.id);
      this.ergebnis.ausTrello++;
    } else {
      const { data } = await this.admin
        .from("aufgaben")
        .upsert(
          { ...felder, trello_id: karte.id },
          { onConflict: "trello_id", ignoreDuplicates: true },
        )
        .select("id");
      if (data?.length) this.ergebnis.neuInApp++;
    }
  }
}

/** Ein vollständiger Abgleich. Gibt null zurück, wenn Trello nicht eingerichtet ist. */
export async function trelloAbgleich(
  admin: SupabaseClient,
  optionen: { webhookPruefen?: boolean } = {},
): Promise<AbgleichErgebnis | null> {
  const k = trelloKonfig();
  if (!k) return null;
  const api = new TrelloApi(k);
  try {
    const tb = await api.board();
    const lauf = new Abgleich(admin, api, tb);
    await lauf.personen();
    await lauf.spalten();
    await lauf.karten();
    await admin.from("aufgaben_trello").upsert({
      id: 1,
      letzter_abgleich: new Date().toISOString(),
      fehler: null,
    });
    const { data: status } = await admin
      .from("aufgaben_trello")
      .select("webhook_id")
      .eq("id", 1)
      .maybeSingle();
    if (optionen.webhookPruefen || !status?.webhook_id) {
      await webhookSicherstellen(admin, api, tb).catch((e) =>
        console.error("[trello] Webhook", e instanceof Error ? e.message : e),
      );
    }
    return lauf.ergebnis;
  } catch (e) {
    const fehler = e instanceof Error ? e.message : String(e);
    await admin
      .from("aufgaben_trello")
      .upsert({ id: 1, fehler: fehler.slice(0, 500) });
    throw e;
  }
}

/** Abgleich nur, wenn der letzte länger als `abstandMs` her ist; Fehler landen im Status. */
export async function trelloAbgleichFallsFaellig(
  admin: SupabaseClient,
  abstandMs: number,
): Promise<void> {
  if (!trelloKonfig()) return;
  const { data } = await admin
    .from("aufgaben_trello")
    .select("letzter_abgleich")
    .eq("id", 1)
    .maybeSingle();
  const zuletzt = data?.letzter_abgleich
    ? Date.parse(String(data.letzter_abgleich))
    : 0;
  if (Date.now() - zuletzt < abstandMs) return;
  await trelloAbgleich(admin).catch((e) =>
    console.error("[trello] Abgleich", e),
  );
}

/** Nach einer Änderung in der App: sofort nach Trello, ohne die App-Aktion scheitern zu lassen. */
export async function trelloNachAenderung(
  admin: SupabaseClient,
): Promise<void> {
  if (!trelloKonfig()) return;
  await trelloAbgleich(admin).catch((e) =>
    console.error("[trello] Abgleich", e),
  );
}

export async function trelloKarteLoeschen(
  trelloId: string | null,
): Promise<void> {
  const k = trelloKonfig();
  if (!k || !trelloId || trelloId.startsWith(SPERRE)) return;
  await new TrelloApi(k)
    .rufe("DELETE", `/cards/${trelloId}`)
    .catch((e) => console.error("[trello] Karte löschen", e));
}

export async function trelloListeArchivieren(
  trelloId: string | null,
): Promise<void> {
  const k = trelloKonfig();
  if (!k || !trelloId || trelloId.startsWith(SPERRE)) return;
  await new TrelloApi(k)
    .rufe("PUT", `/lists/${trelloId}/closed`, { value: true })
    .catch((e) => console.error("[trello] Liste archivieren", e));
}

export async function trelloStatus(
  admin: SupabaseClient,
): Promise<TrelloStatus> {
  const k = trelloKonfig();
  const { data } = await admin
    .from("aufgaben_trello")
    .select("letzter_abgleich, fehler")
    .eq("id", 1)
    .maybeSingle();
  return {
    verbunden: Boolean(k),
    boardUrl: k ? `https://trello.com/b/${k.boardId}` : null,
    letzterAbgleich: (data?.letzter_abgleich as string) ?? null,
    fehler: (data?.fehler as string) ?? null,
  };
}

/** Öffentliche Adresse für den Trello-Webhook, nur in der Produktion. */
export function webhookAdresse(): string | null {
  if (process.env.VERCEL_ENV !== "production") return null;
  const basis =
    (process.env.VITE_APP_ORIGIN ?? "").trim() ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "");
  return basis ? `${basis.replace(/\/$/, "")}/api/trello/webhook` : null;
}

async function webhookSicherstellen(
  admin: SupabaseClient,
  api: TrelloApi,
  tb: TrelloBoard,
): Promise<void> {
  const adresse = webhookAdresse();
  if (!adresse) return;
  const k = trelloKonfig();
  if (!k) return;
  const vorhanden = await api.rufe<
    { id: string; idModel: string; callbackURL: string; active: boolean }[]
  >("GET", `/tokens/${k.token}/webhooks`);
  const passend = vorhanden.find(
    (w) => w.idModel === tb.id && w.callbackURL === adresse && w.active,
  );
  if (passend) {
    await admin
      .from("aufgaben_trello")
      .upsert({ id: 1, webhook_id: passend.id });
    return;
  }
  const neu = await api.rufe<{ id: string }>("POST", "/webhooks", {
    callbackURL: adresse,
    idModel: tb.id,
    description: "Grenz & Co. Aufgabenboard",
  });
  await admin.from("aufgaben_trello").upsert({ id: 1, webhook_id: neu.id });
}

/** Schlanker Zugriff auf die Trello REST API (https://developer.atlassian.com/cloud/trello/rest/). */

export type TrelloKonfig = {
  key: string;
  token: string;
  boardId: string;
  /** API-Secret des Power-Ups, prüft die Signatur eingehender Webhooks. */
  secret: string;
};

export function trelloKonfig(): TrelloKonfig | null {
  const key = (process.env.TRELLO_API_KEY ?? "").trim();
  const token = (process.env.TRELLO_TOKEN ?? "").trim();
  const boardId = (process.env.TRELLO_BOARD_ID ?? "").trim();
  if (!key || !token || !boardId) return null;
  return {
    key,
    token,
    boardId,
    secret: (process.env.TRELLO_API_SECRET ?? "").trim(),
  };
}

export type TrelloListe = { id: string; name: string; pos: number };
export type TrelloCheckliste = {
  id: string;
  idCard: string;
  name: string;
  checkItems: {
    id: string;
    name: string;
    state: "complete" | "incomplete";
    pos: number;
  }[];
};
export type TrelloKarte = {
  id: string;
  name: string;
  desc: string;
  due: string | null;
  idList: string;
  pos: number;
  idMembers: string[];
  idLabels: string[];
  dateLastActivity: string;
};
export type TrelloMitglied = { id: string; fullName: string; username: string };
export type TrelloLabel = { id: string; name: string; color: string | null };
export type TrelloBoard = {
  id: string;
  name: string;
  url: string;
  lists: TrelloListe[];
  cards: TrelloKarte[];
  members: TrelloMitglied[];
  labels: TrelloLabel[];
  checklists: TrelloCheckliste[];
};

type Wert = string | number | boolean | null | undefined | string[];

export class TrelloApi {
  constructor(private readonly k: TrelloKonfig) {}

  async rufe<T>(
    methode: "GET" | "POST" | "PUT" | "DELETE",
    pfad: string,
    werte: Record<string, Wert> = {},
  ): Promise<T> {
    const url = new URL(`https://api.trello.com/1${pfad}`);
    url.searchParams.set("key", this.k.key);
    url.searchParams.set("token", this.k.token);
    const body = new URLSearchParams();
    for (const [n, w] of Object.entries(werte)) {
      if (w === undefined) continue;
      const s = w === null ? "" : Array.isArray(w) ? w.join(",") : String(w);
      if (methode === "GET" || methode === "DELETE") url.searchParams.set(n, s);
      else body.set(n, s);
    }
    const res = await fetch(url, {
      method: methode,
      ...(methode === "POST" || methode === "PUT"
        ? {
            body,
            headers: { "content-type": "application/x-www-form-urlencoded" },
          }
        : {}),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const text = (await res.text()).slice(0, 200);
      throw new Error(`Trello ${methode} ${pfad}: ${res.status} ${text}`);
    }
    return (await res.json()) as T;
  }

  async board(): Promise<TrelloBoard> {
    const [board, checklists] = await Promise.all([
      this.rufe<Omit<TrelloBoard, "checklists">>(
        "GET",
        `/boards/${this.k.boardId}`,
        {
          fields: "name,url",
          lists: "open",
          list_fields: "name,pos",
          cards: "open",
          card_fields:
            "name,desc,due,idList,pos,idMembers,idLabels,dateLastActivity",
          members: "all",
          member_fields: "fullName,username",
          labels: "all",
          label_fields: "name,color",
          labels_limit: 1000,
        },
      ),
      this.rufe<TrelloCheckliste[]>(
        "GET",
        `/boards/${this.k.boardId}/checklists`,
        {
          fields: "name,idCard",
          checkItems: "all",
          checkItem_fields: "name,state,pos",
        },
      ),
    ]);
    return { ...board, checklists };
  }

  get boardId(): string {
    return this.k.boardId;
  }
}

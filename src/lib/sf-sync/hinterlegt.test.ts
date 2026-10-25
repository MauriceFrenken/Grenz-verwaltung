import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { hinterlegtenZugangHolen, verbindungHinterlegen } from "./hinterlegt";

/** Minimaler Supabase-Ersatz: eine Zeile app_integrationen und ein Vault-Eintrag. */
function fakeAdmin(start: { secret: boolean; refresh?: string }) {
  const zeile: Record<string, unknown> = start.secret
    ? { status: "verbunden", token_secret_id: "s1" }
    : {};
  const vault: { access_token?: string; refresh_token?: string } = {
    refresh_token: start.refresh,
  };
  const rpc = vi.fn(async (name: string, args: Record<string, string>) => {
    if (name === "integration_token_lesen")
      return { data: [vault], error: null };
    if (name === "integration_token_speichern") {
      vault.access_token = args.p_access_token;
      vault.refresh_token = args.p_refresh_token;
      zeile.token_secret_id = "s1";
    }
    return { data: null, error: null };
  });
  const from = () => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: { ...zeile }, error: null }),
      }),
    }),
    update: (werte: Record<string, unknown>) => ({
      eq: async () => {
        Object.assign(zeile, werte);
        return { error: null };
      },
    }),
    upsert: async (werte: Record<string, unknown>) => {
      Object.assign(zeile, werte);
      return { error: null };
    },
  });
  return { admin: { rpc, from } as unknown as SupabaseClient, zeile, vault };
}

function tokenAntwort(ok: boolean) {
  return new Response(
    JSON.stringify(
      ok
        ? {
            access_token: "neu",
            instance_url: "https://grenz.my.salesforce.com",
          }
        : {
            error: "invalid_grant",
            error_description: "expired access/refresh token",
          },
    ),
    { status: ok ? 200 : 400, headers: { "Content-Type": "application/json" } },
  );
}

describe("hinterlegte Salesforce-Verbindung", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("liefert ohne hinterlegten Token null", async () => {
    const { admin } = fakeAdmin({ secret: false });
    expect(await hinterlegtenZugangHolen(admin)).toBeNull();
  });

  it("holt per Refresh Token einen Access Token und behält den Refresh Token", async () => {
    vi.stubEnv("SALESFORCE_CLIENT_ID", "cid");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => tokenAntwort(true)),
    );
    const { admin, vault, zeile } = fakeAdmin({ secret: true, refresh: "rt" });
    expect(await hinterlegtenZugangHolen(admin)).toEqual({
      accessToken: "neu",
      instanceUrl: "https://grenz.my.salesforce.com",
    });
    expect(vault).toEqual({ access_token: "neu", refresh_token: "rt" });
    expect(zeile.status).toBe("verbunden");
  });

  it("markiert einen abgelehnten Token als Fehler", async () => {
    vi.stubEnv("SALESFORCE_CLIENT_ID", "cid");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => tokenAntwort(false)),
    );
    const { admin, zeile } = fakeAdmin({ secret: true, refresh: "rt" });
    await expect(hinterlegtenZugangHolen(admin)).rejects.toThrow(
      /nicht mehr gültig/,
    );
    expect(zeile.status).toBe("fehler");
  });

  it("hinterlegt nur einen eingelösten Refresh Token", async () => {
    vi.stubEnv("SALESFORCE_CLIENT_ID", "cid");
    const fetchMock = vi.fn(async (url: string) =>
      String(url).endsWith("/userinfo")
        ? new Response(JSON.stringify({ email: "m@grenz-co.de" }), {
            status: 200,
          })
        : tokenAntwort(true),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { admin, vault } = fakeAdmin({ secret: false });
    const v = await verbindungHinterlegen(admin, "rt", "user-1");
    expect(v.kontoEmail).toBe("m@grenz-co.de");
    expect(v.status).toBe("verbunden");
    expect(vault.refresh_token).toBe("rt");
    await expect(verbindungHinterlegen(admin, " ", null)).rejects.toThrow(
      /Refresh Token/,
    );
  });
});

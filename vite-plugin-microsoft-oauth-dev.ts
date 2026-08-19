import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { loadEnv } from "vite";

import { completeMicrosoftConnect } from "./src/lib/microsoft/connect";

const CONNECT_PATH = "/api/microsoft-oauth/connect";
const MAX_BODY_BYTES = 64 * 1024;

function applyCors(res: ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

export function microsoftOauthDevPlugin(): Plugin {
  return {
    name: "microsoft-oauth-dev",
    enforce: "pre",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const pathname = req.url?.split("?")[0] ?? "";
        if (pathname !== CONNECT_PATH) {
          next();
          return;
        }

        applyCors(res);

        if (req.method === "OPTIONS") {
          res.statusCode = 204;
          res.end();
          return;
        }

        if (req.method !== "POST") {
          sendJson(res, 405, { error: "Method not allowed" });
          return;
        }

        const env = loadEnv(server.config.mode, process.cwd(), "");
        for (const key of [
          "VITE_MICROSOFT_CLIENT_ID",
          "VITE_MICROSOFT_TENANT_ID",
          "MICROSOFT_CLIENT_ID",
          "MICROSOFT_CLIENT_SECRET",
          "MICROSOFT_TENANT_ID",
          "MICROSOFT_MAILBOX",
          "VITE_SUPABASE_URL",
          "SUPABASE_URL",
          "SUPABASE_SERVICE_ROLE_KEY",
        ]) {
          if (env[key]) process.env[key] = env[key];
        }

        try {
          const raw = await readBody(req);
          const body = JSON.parse(raw || "{}") as {
            code?: string;
            codeVerifier?: string;
            redirectUri?: string;
            supabaseAccessToken?: string;
          };

          const result = await completeMicrosoftConnect({
            code: body.code ?? "",
            codeVerifier: body.codeVerifier ?? "",
            redirectUri: body.redirectUri ?? "",
            supabaseAccessToken: body.supabaseAccessToken ?? "",
          });

          sendJson(res, 200, result);
        } catch (e) {
          sendJson(res, 400, {
            error: e instanceof Error ? e.message : "Microsoft connect failed",
          });
        }
      });
    },
  };
}

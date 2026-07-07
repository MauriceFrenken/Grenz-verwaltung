import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { loadEnv } from "vite";

import {
  exchangeAuthorizationCode,
  getMicrosoftOAuthConfig,
  refreshAccessToken,
  resolveMicrosoftTenantId,
  tokenPayload,
} from "./src/lib/microsoft-oauth";

const OAUTH_PATH = "/api/microsoft-oauth";

function applyCors(res: ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export function microsoftOAuthDevPlugin(): Plugin {
  return {
    name: "microsoft-oauth-dev",
    enforce: "pre",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const pathname = req.url?.split("?")[0] ?? "";
        if (pathname !== OAUTH_PATH) {
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
          res.statusCode = 405;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }

        const env = loadEnv(server.config.mode, process.cwd(), "");
        process.env.VITE_MICROSOFT_CLIENT_ID = env.VITE_MICROSOFT_CLIENT_ID;
        process.env.MICROSOFT_CLIENT_SECRET = env.MICROSOFT_CLIENT_SECRET;
        process.env.VITE_MICROSOFT_TENANT_ID = env.VITE_MICROSOFT_TENANT_ID;

        let parsedBody: Record<string, unknown> = {};
        try {
          const raw = await readBody(req);
          parsedBody = JSON.parse(raw || "{}") as Record<string, unknown>;
        } catch {
          res.statusCode = 400;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Invalid JSON body" }));
          return;
        }

        const tenantId = resolveMicrosoftTenantId(
          typeof parsedBody.tenantId === "string" ? parsedBody.tenantId : undefined,
        );
        const config = getMicrosoftOAuthConfig(tenantId);
        if (!config) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              error:
                "VITE_MICROSOFT_CLIENT_ID und MICROSOFT_CLIENT_SECRET in .env.local setzen und Dev-Server neu starten.",
            }),
          );
          return;
        }

        try {
          const body = parsedBody;
          const action = typeof body.action === "string" ? body.action : "exchange";

          if (action === "refresh") {
            const refreshToken = typeof body.refreshToken === "string" ? body.refreshToken.trim() : "";
            if (!refreshToken) {
              res.statusCode = 400;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "refreshToken is required" }));
              return;
            }
            const token = await refreshAccessToken({ config, refreshToken });
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(tokenPayload(token)));
            return;
          }

          const code = typeof body.code === "string" ? body.code.trim() : "";
          const codeVerifier = typeof body.codeVerifier === "string" ? body.codeVerifier.trim() : "";
          const redirectUri = typeof body.redirectUri === "string" ? body.redirectUri.trim() : "";

          if (!code || !codeVerifier || !redirectUri) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "code, codeVerifier and redirectUri are required" }));
            return;
          }

          const token = await exchangeAuthorizationCode({ config, code, redirectUri, codeVerifier });
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(tokenPayload(token)));
        } catch (e) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: e instanceof Error ? e.message : "Server error" }));
        }
      });
    },
  };
}

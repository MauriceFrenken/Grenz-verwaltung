import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { loadEnv } from "vite";

import { exchangeSalesforceAuthorizationCode } from "./src/lib/salesforce/token-exchange";

const TOKEN_PATH = "/api/salesforce-oauth/token";
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

export function salesforceOauthDevPlugin(): Plugin {
  return {
    name: "salesforce-oauth-dev",
    enforce: "pre",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const pathname = req.url?.split("?")[0] ?? "";
        if (pathname !== TOKEN_PATH) {
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
          "VITE_SALESFORCE_CLIENT_ID",
          "SALESFORCE_CLIENT_ID",
          "SALESFORCE_CLIENT_SECRET",
          "SALESFORCE_LOGIN_URL",
          "VITE_SALESFORCE_LOGIN_URL",
        ]) {
          if (env[key]) process.env[key] = env[key];
        }

        try {
          const raw = await readBody(req);
          const body = JSON.parse(raw || "{}") as {
            code?: string;
            codeVerifier?: string;
            redirectUri?: string;
          };

          const result = await exchangeSalesforceAuthorizationCode({
            code: body.code ?? "",
            codeVerifier: body.codeVerifier ?? "",
            redirectUri: body.redirectUri ?? "",
          });

          sendJson(res, 200, result);
        } catch (e) {
          sendJson(res, 400, {
            error: e instanceof Error ? e.message : "Token exchange failed",
          });
        }
      });
    },
  };
}

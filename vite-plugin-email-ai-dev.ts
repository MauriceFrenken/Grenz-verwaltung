import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { loadEnv } from "vite";

import { handleAnalyzeDokumentRequest, type AnalyzeDokumentRequest } from "./src/lib/email-ai";

const ANALYZE_PATH = "/api/analyze-dokument";
const MAX_BODY_BYTES = 32 * 1024 * 1024;

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

export function emailAiDevPlugin(): Plugin {
  return {
    name: "email-ai-dev",
    enforce: "pre",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const pathname = req.url?.split("?")[0] ?? "";
        if (pathname !== ANALYZE_PATH) {
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
        process.env.OPENAI_API_KEY = env.OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;
        process.env.ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY;
        if (env.ANTHROPIC_MODEL?.trim()) {
          process.env.ANTHROPIC_MODEL = env.ANTHROPIC_MODEL;
        }

        let parsedBody: AnalyzeDokumentRequest = {
          kategorien: [],
          mandanten: [],
          objekte: [],
        };
        try {
          const raw = await readBody(req);
          parsedBody = JSON.parse(raw || "{}") as AnalyzeDokumentRequest;
        } catch (e) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: e instanceof Error ? e.message : "Invalid JSON body" }));
          return;
        }

        try {
          const result = await handleAnalyzeDokumentRequest(parsedBody);
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(result));
        } catch (e) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: e instanceof Error ? e.message : "Server error" }));
        }
      });
    },
  };
}

// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { fileURLToPath } from "node:url";

import { defineConfig } from "@lovable.dev/vite-tanstack-config";

import { exposeAiDevPlugin } from "./vite-plugin-expose-ai-dev";
import { salesforceOauthDevPlugin } from "./vite-plugin-salesforce-oauth-dev";
import { microsoftOauthDevPlugin } from "./vite-plugin-microsoft-oauth-dev";

/**
 * Kompletter Dependency-Baum von ebics-client (CJS).
 * Muss ins Server-Bundle, sonst fehlen nested requires auf Vercel (z. B. asn1).
 */
const EBICS_BUNDLE = [
  "ebics-client",
  "asn1",
  "node-forge",
  "node-rsa",
  "handlebars",
  "xml-crypto",
  "js2xmlparser",
  "xpath",
  "@xmldom/xmldom",
  "@xmldom/is-dom-node",
  "uuid",
  "rock-req",
  "xmlcreate",
  "minimist",
  "neo-async",
  "source-map",
  "wordwrap",
  "safer-buffer",
];

export default defineConfig({
  plugins: [
    exposeAiDevPlugin(),
    salesforceOauthDevPlugin(),
    microsoftOauthDevPlugin(),
  ],
  vite: {
    // Grenz-Vorlagen der KI-Tools (src/lib/ki-tools/vorlagen) als ?inline-Assets.
    assetsInclude: ["**/*.pptx", "**/*.xlsx"],
    server: {
      port: 8080,
      strictPort: true,
    },
    ssr: {
      noExternal: EBICS_BUNDLE,
    },
    // tslib fest auf die 2.x der App: traceDeps (pdfkit) legt sonst pdf-libs tslib 1.x als
    // node_modules/tslib ins Vercel-Paket, und Radix bricht mit fehlendem __spreadArray ab.
    resolve: {
      alias: [
        {
          find: /^tslib$/,
          replacement: fileURLToPath(
            new URL("./node_modules/tslib/tslib.es6.mjs", import.meta.url),
          ),
        },
      ],
    },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  // Postfach-Nachtlauf: Hobby-Plan erlaubt max. 300s pro Function.
  nitro: {
    vercel: {
      functions: {
        maxDuration: 300,
      },
    },
    externals: {
      inline: EBICS_BUNDLE,
    },
    // pdfkit lädt seine Standardschriften zur Laufzeit über "#standard-fonts/*" (package.json
    // "imports"). Gebündelt in _libs fehlt diese Zuordnung → "Cannot find module
    // '#standard-fonts/Helvetica'" auf Vercel. Daher pdfkit komplett als Paket mitliefern.
    traceDeps: ["pdfkit*"],
  } as {
    preset?: string;
    externals?: { inline?: string[] };
    traceDeps?: string[];
  },
});

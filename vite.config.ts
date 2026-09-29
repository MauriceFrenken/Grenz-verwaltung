// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

import { exposeAiDevPlugin } from "./vite-plugin-expose-ai-dev";
import { salesforceOauthDevPlugin } from "./vite-plugin-salesforce-oauth-dev";
import { microsoftOauthDevPlugin } from "./vite-plugin-microsoft-oauth-dev";

/** CJS-Banking-Lib +Deps müssen ins Server-Bundle, sonst fehlt sie auf Vercel. */
const EBICS_BUNDLE = [
  "ebics-client",
  "node-forge",
  "node-rsa",
  "handlebars",
  "xml-crypto",
  "js2xmlparser",
  "xpath",
  "@xmldom/xmldom",
  "uuid",
  "rock-req",
];

export default defineConfig({
  plugins: [exposeAiDevPlugin(), salesforceOauthDevPlugin(), microsoftOauthDevPlugin()],
  vite: {
    server: {
      port: 8080,
      strictPort: true,
    },
    ssr: {
      noExternal: EBICS_BUNDLE,
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
  } as {
    preset?: string;
    externals?: { inline?: string[] };
  },
});

import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Eigene, schlanke Konfiguration für Tests und Skripte (ohne Lovable/TanStack-Plugins).
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    environment: "node",
  },
});

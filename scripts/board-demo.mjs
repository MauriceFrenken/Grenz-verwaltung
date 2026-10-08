// Startet die App im Board-Demo-Modus: fiktive Daten, Cockpit und /board ohne Anmeldung,
// Supabase zeigt auf eine nicht erreichbare Dummy-Adresse. Liest keine .env-Werte aus.
import { spawn } from "node:child_process";

const env = {
  ...process.env,
  VITE_BOARD_DEMO: "1",
  VITE_BOARD_DATENQUELLE: "mock",
  VITE_SUPABASE_URL: "http://127.0.0.1:9",
  VITE_SUPABASE_ANON_KEY: "board-demo",
};

console.log("\nFRENKEN Management Board (Demodaten): http://localhost:8080/\n");
const kind = spawn("npx", ["vite", "dev", ...process.argv.slice(2)], {
  stdio: "inherit",
  env,
  shell: process.platform === "win32",
});
kind.on("exit", (code) => process.exit(code ?? 0));

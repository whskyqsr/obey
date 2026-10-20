import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173 },
  preview: { host: "0.0.0.0", port: Number(process.env.PORT) || 4173 },
  build: { sourcemap: true, chunkSizeWarningLimit: 1500 },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    // material-color-utilities 0.4 ships an extensionless ESM import that Node can't resolve; let Vite transform it.
    server: { deps: { inline: ["@material/material-color-utilities"] } },
  },
});

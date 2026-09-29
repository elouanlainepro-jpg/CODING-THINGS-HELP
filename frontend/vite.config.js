import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// En dev, Vite (port 5173) relaie l'API et les fichiers vers FastAPI (port 8000).
const backend = process.env.BACKEND_URL || "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": backend,
      "/clips": backend,
      "/media": backend,
    },
  },
});

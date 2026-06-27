import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const target = "http://localhost:4000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/events": target,
      "/sessions": target,
      "/seo": target,
      "/contacts": target,
      "/webhook": target,
      "/ingest": target,
      "/health": target,
      "/api": target
    }
  }
});

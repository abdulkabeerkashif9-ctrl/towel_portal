import path from "node:path"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig, loadEnv } from "vite"

// Production build is served by Frappe from the app's public folder.
const ASSET_BASE = "/assets/towel_portal/frontend/"

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_")
  const target = env.VITE_FRAPPE_URL || "http://localhost:8000"
  const proxy = { target, changeOrigin: true, headers: env.VITE_FRAPPE_SITE ? { "X-Frappe-Site-Name": env.VITE_FRAPPE_SITE } : undefined }

  return {
    base: command === "build" ? ASSET_BASE : "/",
    plugins: [react(), tailwindcss()],
    resolve: { alias: { "@": path.resolve(__dirname, "src") } },
    build: {
      outDir: "../towel_portal/public/frontend",
      emptyOutDir: true,
      chunkSizeWarningLimit: 900,
    },
    server: {
      port: 5173,
      // Log in at http://localhost:5173/login (proxied) so the session cookie is on this origin
      proxy: Object.fromEntries(["/api", "/login", "/app", "/assets", "/files", "/private"].map((p) => [p, proxy])),
    },
  }
})

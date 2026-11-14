import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Config runs in Node; only this one global is needed, so skip @types/node.
declare const process: { env: Record<string, string | undefined> };

// Where `npm run dev` / `npm run preview` forward /api. Override when port 8080 is taken:
//   BULWARK_GATEWAY_URL=http://localhost:8090 npm run dev
const gateway = process.env.BULWARK_GATEWAY_URL ?? "http://localhost:8080";
const proxy = {
  "/api": {
    target: gateway,
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/api/, ""),
  },
};

export default defineConfig({
  plugins: [react()],
  // Never inline assets as data: URIs; nginx's CSP (font-src via default-src 'self')
  // blocks them, which silently dropped the smallest font subsets.
  build: { assetsInlineLimit: 0 },
  server: { proxy },
  preview: { proxy },
});

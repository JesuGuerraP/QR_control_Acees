// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [
      VitePWA({
        registerType: "autoUpdate",
        injectRegister: null,
        filename: "sw.js",
        devOptions: { enabled: false },
        manifest: {
          name: "ATUCSARA · Control de Cupos de Grado",
          short_name: "Grados ATUCSARA",
          start_url: "/",
          display: "standalone",
          background_color: "#fbfaf5",
          theme_color: "#0b1f4d",
          lang: "es",
          icons: [
            { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
          ],
        },
        workbox: {
          navigateFallback: null,
          globPatterns: ["**/*.{js,css,png,svg,woff2}"],
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.pathname.startsWith("/__l5e/assets-v1/"),
              handler: "CacheFirst",
              options: { cacheName: "institution-assets" },
            },
            {
              urlPattern: ({ request, url }) => request.mode === "navigate" && !url.pathname.startsWith("/~oauth"),
              handler: "NetworkFirst",
              options: { cacheName: "pages", networkTimeoutSeconds: 3 },
            },
            {
              urlPattern: ({ url }) => url.origin === "https://fonts.googleapis.com" || url.origin === "https://fonts.gstatic.com",
              handler: "StaleWhileRevalidate",
              options: { cacheName: "fonts" },
            },
          ],
        },
      }),
    ],
  },
});

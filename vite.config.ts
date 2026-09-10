import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  server: {
    port: 5174,
    proxy: {
      "/ws": {
        target: "ws://localhost:8787",
        ws: true,
      },
      "/sessions": {
        target: "http://localhost:8787",
      },
      "/health": {
        target: "http://localhost:8787",
      },
    },
  },
});

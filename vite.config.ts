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
    },
  },
});

import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  // The same "@/" alias Next resolves. Without it a test could not import any
  // route that uses it internally, which ruled out testing most of them.
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    environment: "node",
  },
});

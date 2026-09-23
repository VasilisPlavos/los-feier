import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// base must match the GitHub Pages path: https://vasilisplavos.github.io/holidays/
export default defineConfig({
  base: "/holidays/",
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});

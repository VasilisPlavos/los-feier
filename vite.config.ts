import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// base must match the GitHub Pages path (https://vasilisplavos.github.io/<repo>/).
// CI sets BASE_PATH from the repository name; locally the default is used.
export default defineConfig({
  base: process.env.BASE_PATH ?? "/los-feier/",
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});

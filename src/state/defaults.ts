import type { AppState } from "../core/types";

export function createDefaultState(): AppState {
  return { version: 2, language: null, theme: "system", leave: {}, profiles: {} };
}

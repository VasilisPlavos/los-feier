import type { AppState } from "../core/types";

export function exportStateJson(state: AppState): string {
  return JSON.stringify(state, null, 2);
}

/** Lets the browser download `text` as a file. */
export function downloadText(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

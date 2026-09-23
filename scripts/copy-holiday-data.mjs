// Copies the compact holiday JSON files (not raw/*.ics) into public/ so Vite serves
// them in dev and copies them into dist/ on build. Runs automatically via predev/prebuild.
import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "data", "holidays");
const DEST = join(ROOT, "public", "data", "holidays");

await rm(DEST, { recursive: true, force: true });
await mkdir(DEST, { recursive: true });
const files = (await readdir(SRC)).filter((f) => f.endsWith(".json"));
for (const file of files) await cp(join(SRC, file), join(DEST, file));
console.log(`Copied ${files.length} holiday files to public/data/holidays`);

/**
 * Generates large ballast files that simulate heavyweight third-party client
 * dependencies without committing megabytes of generated source.
 */

import { existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const componentsDir = join(__dirname, "..", "lib", "components");

const ballastFiles = [
  {
    file: "chart-ballast.ts",
    targetMB: 3,
    comment:
      "Auto-generated ballast data (~3 MB) — simulates a heavy visualization dependency",
  },
];

const FILLER =
  "Simulated heavy dependency payload used to approximate realistic bundle sizes during reproduction runs";

function randomKey() {
  return "item_" + Math.random().toString(36).slice(2);
}

function randomValue() {
  return Math.random().toFixed(8);
}

function createEntry(id) {
  return JSON.stringify({ id, k: randomKey(), v: randomValue(), d: FILLER });
}

function buildFileContent(comment, entries) {
  return [
    `// ${comment}`,
    `export const BALLAST_DATA: Array<{ id: number; k: string; v: string; d: string }> = [${entries.join(",")}];`,
    "",
  ].join("\n");
}

function generateBallastFile({ file, targetMB, comment }) {
  const outputPath = join(componentsDir, file);

  if (existsSync(outputPath)) {
    console.log(`[ballast] ${file} already exists, skipping.`);
    return;
  }

  const targetBytes = targetMB * 1024 * 1024;
  const entries = [];
  let currentSize = 0;
  let id = 0;

  while (currentSize < targetBytes) {
    const entry = createEntry(id);
    entries.push(entry);
    currentSize += entry.length + 1;
    id++;
  }

  const content = buildFileContent(comment, entries);
  writeFileSync(outputPath, content, "utf-8");

  const actualMB = (Buffer.byteLength(content) / 1024 / 1024).toFixed(1);
  console.log(`[ballast] Generated ${file} — ${actualMB} MB (${id} entries)`);
}

for (const spec of ballastFiles) {
  generateBallastFile(spec);
}

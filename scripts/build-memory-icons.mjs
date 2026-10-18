import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import sharp from "sharp";
import { getCatalog } from "../src/lib/plugin-details.mjs";

const root = resolve(".");
const destination = resolve(process.argv[2] || "dist");
if (!destination.startsWith(root + sep)) throw new Error("Icon output must stay in this workspace");
const output = resolve(destination, "memory-icons");
await mkdir(output, { recursive: true });
const catalog = getCatalog();
const releases = [...catalog.projects.values()].flatMap((project) => project.releases).sort((a, b) => a.submission_date - b.submission_date || a.id - b.id);
const limit = Number(process.argv.find((value) => value.startsWith("--limit="))?.slice(8)) || Infinity;
const normalized = new Map(), tiles = [], icons = {}, sheets = new Map();
let unavailable = 0;
for (const release of releases) {
  const row = catalog.media.by_release[String(release.id)];
  const image = catalog.media.resources[row?.icon];
  if (!image?.path) { if (release.icon_url) unavailable++; continue; }
  let tile = normalized.get(image.path);
  if (!tile) {
    if (tiles.length >= limit) continue;
    const input = await readFile(resolve("public", image.path.slice(1)));
    const bytes = await sharp(input, { limitInputPixels: 40000000 }).resize(96, 96, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } }).png().toBuffer();
    const hash = createHash("sha256").update(bytes).digest("hex");
    tile = tiles.find((candidate) => candidate.hash === hash);
    if (!tile) { const position = tiles.length; tile = { hash, bytes, sheetIndex: Math.floor(position / 64), column: position % 8, row: Math.floor(position % 64 / 8) }; tiles.push(tile); }
    normalized.set(image.path, tile);
  }
  icons[String(release.id)] = tile;
}
for (let start = 0; start < tiles.length; start += 64) {
  const data = await sharp({ create: { width: 768, height: 768, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 0 } } }).composite(tiles.slice(start, start + 64).map((tile) => ({ input: tile.bytes, left: tile.column * 96, top: tile.row * 96 }))).webp({ quality: 88, effort: 4 }).toBuffer();
  const name = `memory-${String(start / 64).padStart(3, "0")}-${createHash("sha256").update(data).digest("hex").slice(0, 16)}.webp`;
  await writeFile(resolve(output, name), data);
  sheets.set(start / 64, "/memory-icons/" + name);
}
await writeFile(resolve(output, "manifest.json"), JSON.stringify({ schema_version: 1, snapshot_id: catalog.pointer.snapshot_id, unique_icons: tiles.length, unavailable_sources: unavailable, partial: limit !== Infinity, icons: Object.fromEntries(Object.entries(icons).map(([id, tile]) => [id, { sheet: sheets.get(tile.sheetIndex), column: tile.column, row: tile.row }])) }) + "\n");
console.log(`Built ${tiles.length} unique Memory icons from preserved local files. No network requests.`);

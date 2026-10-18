// Explicit, resumable capture. Normal site builds never download remote media.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import dns from "node:dns/promises";
import sanitizeHtml from "sanitize-html";
import { displayImage } from "../src/lib/preserved-image.mjs";
import { getCatalog } from "../src/lib/plugin-details.mjs";
import { canonicalImage, frozenImageUrl, imageUrl } from "../src/lib/media-urls.mjs";

const catalog = getCatalog();
const releases = [...catalog.projects.values()].flatMap((project) => project.releases);
const snapshot = resolve("data/snapshots", catalog.pointer.snapshot_id);
const output = resolve("public/archive-media");
const cache = resolve("archive/media-captures");
await mkdir(output, { recursive: true });
await mkdir(cache, { recursive: true });
const hash = (data) => createHash("sha256").update(data).digest("hex");
const readJson = async (path, fallback = {}) => { try { return JSON.parse(await readFile(path, "utf8")); } catch (error) { if (error.code !== "ENOENT") throw error; return fallback; } };
const pharImages = await readJson(resolve("archive/media-phar/index.json"));
const byRelease = {};
const tasks = new Map();

function addImage(value, canonical, release, kind) {
  const original = imageUrl(value, release);
  const frozen = frozenImageUrl(canonical || value, release);
  if (!original || !frozen) return;
  const key = hash(original + "\n" + frozen);
  if (!tasks.has(key)) tasks.set(key, { key, original_url: original, capture_url: frozen, release_ids: [], kinds: [] });
  const task = tasks.get(key);
  if (!task.release_ids.includes(String(release.id))) task.release_ids.push(String(release.id));
  if (!task.kinds.includes(kind)) task.kinds.push(kind);
  const record = byRelease[String(release.id)] ||= { images: {} };
  record.images[original] = key;
  if (kind === "icon") record.icon = key;
}
for (const release of releases) {
  if (release.icon_url) addImage(release.icon_url, release.icon_url, release, "icon");
  for (const [filename, document] of Object.entries(catalog.details.records[String(release.id)].documents || {})) {
    if (!filename.endsWith(".html")) continue;
    sanitizeHtml(document.content, { allowedTags: [], transformTags: { img: (tagName, attributes) => {
      addImage(attributes.src, canonicalImage(attributes), release, filename);
      return { tagName, attribs: attributes };
    } } });
  }
}
console.log(`Capture inventory: ${tasks.size} image contexts for ${releases.length} releases`);
const releaseById = new Map(releases.map((release) => [String(release.id), release]));
const results = {};
const hostBackoff = new Map();
const addresses = new Map();
async function publicUrl(value) {
  const url = new URL(value);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || (url.port && !["80", "443"].includes(url.port))) throw new Error("Unsupported public image URL");
  if (!addresses.has(url.hostname)) addresses.set(url.hostname, dns.lookup(url.hostname, { all: true }));
  const resolved = await addresses.get(url.hostname);
  if (!resolved.length || resolved.some(({ address }) => /^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.|::|f[cd]|fe80:)/i.test(address))) throw new Error("Nonpublic image host");
  return url;
}
async function download(value) {
  let url = await publicUrl(value);
  for (let redirect = 0; redirect < 6; redirect++) {
    if (url.hostname.includes("poggit")) throw new Error("Poggit endpoint is a historical reference");
    if ((hostBackoff.get(url.hostname) || 0) > Date.now()) throw new Error("Host rate limit: deferred");
    const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(12000), headers: { "User-Agent": "PoggitArchiveMediaPreservation/1.0 (+https://poggit-archive.github.io/)", Accept: "image/*" } });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      url = await publicUrl(new URL(response.headers.get("location"), url).href);
      continue;
    }
    if (!response.ok) {
      if (response.status === 429 || response.status === 403 && response.headers.has("retry-after")) hostBackoff.set(url.hostname, Date.now() + Math.max(60000, Number(response.headers.get("retry-after")) * 1000 || 60000));
      await response.body?.cancel();
      throw new Error(`HTTP ${response.status}`);
    }
    const chunks = []; let bytes = 0;
    for await (const chunk of response.body) {
      bytes += chunk.length;
      if (bytes > 16 * 1024 * 1024) throw new Error("Image exceeds 16 MiB");
      chunks.push(chunk);
    }
    return { data: Buffer.concat(chunks), final_url: url.href };
  }
  throw new Error("Too many image redirects");
}
async function saveImage(data, provenance) {
  const originalSha = hash(data);
  const converted = await displayImage(data);
  const display = converted.bytes, extension = converted.extension;
  if (converted.transformed) {
    await writeFile(resolve(output, `${originalSha}.svg.txt`), data);
  }
  const digest = hash(display);
  const filename = `${digest}.${extension}`;
  await writeFile(resolve(output, filename), display);
  return { status: "preserved", path: `/archive-media/${filename}`, sha256: digest, bytes: display.length, original_sha256: originalSha, original_bytes: data.length, original_path: converted.transformed ? `/archive-media/${originalSha}.svg.txt` : `/archive-media/${filename}`, width: converted.width, height: converted.height, captured_at: new Date().toISOString(), ...provenance };
}

async function recoverFromPhar(task) {
  // Match a named image in the same release's verified original distribution.
  for (const id of task.release_ids) {
    const release = releaseById.get(id);
    const url = new URL(task.capture_url);
    const parts = decodeURIComponent(url.pathname).split("/").filter(Boolean);
    const ownRepo = parts.slice(0, 2).join("/").toLowerCase() === release.repo_name.toLowerCase();
    if (url.hostname !== "raw.githubusercontent.com" || !ownRepo || parts[2] !== release.build_commit) continue;
    const relative = parts.slice(3).join("/");
    const matches = Object.entries(pharImages[id] || {}).filter(([name]) => relative === name || relative.endsWith("/" + name));
    if (matches.length !== 1) continue;
    const [entry, item] = matches[0];
    const data = await readFile(resolve("archive/media-phar", item.file));
    if (hash(data) !== item.sha256) throw new Error("Recovered PHAR image checksum mismatch");
    return saveImage(data, { method: "verified_phar_entry", release_id: id, phar_sha256: catalog.downloads[id].sha256, phar_entry: entry });
  }
  return null;
}
async function capture(task) {
  const checkpoint = resolve(cache, `${task.key}.json`);
  const cached = await readJson(checkpoint, null);
  if (cached && (!process.argv.includes("--retry-missing") || cached.status === "preserved")) {
    if (cached.status === "preserved") {
      const data = await readFile(resolve("public", cached.path.slice(1)));
      if (hash(data) !== cached.sha256) throw new Error("Preserved image checksum mismatch");
    }
    return cached;
  }
  const attempts = [];
  try {
    const recovered = await recoverFromPhar(task);
    if (recovered) { await writeFile(checkpoint, JSON.stringify(recovered)); return recovered; }
  } catch (error) { attempts.push(`PHAR: ${error.message}`); }
  const candidates = [...new Set([task.capture_url, task.original_url])];
  // Do not silently substitute a mutable branch after an exact own-repository
  // revision fails. The historical icon cache is a documented last resort.
  if (task.capture_url.includes("raw.githubusercontent.com") && task.capture_url !== task.original_url && new URL(task.original_url).hostname !== "camo.githubusercontent.com") candidates.splice(1);
  for (const url of candidates) {
    try {
      const downloaded = await download(url);
      const saved = await saveImage(downloaded.data, { method: url === task.capture_url ? "captured_url" : "captured_camo", fetched_url: downloaded.final_url });
      await writeFile(checkpoint, JSON.stringify(saved)); return saved;
    } catch (error) { attempts.push(`${url}: ${error.message}`); }
  }
  if (task.kinds.includes("icon")) {
    try {
      const data = await readFile(resolve(".memory-icon-cache", `${hash(task.original_url)}.png`));
      const saved = await saveImage(data, { method: "previous_normalized_icon_cache", note: "96px derivative retained from the previous icon capture; original image bytes unavailable." });
      await writeFile(checkpoint, JSON.stringify(saved)); return saved;
    } catch (error) { if (error.code !== "ENOENT") attempts.push(error.message); }
  }
  const missing = { status: "unavailable", checked_at: new Date().toISOString(), attempts };
  await writeFile(checkpoint, JSON.stringify(missing));
  return missing;
}
const queue = [...tasks.values()]; let cursor = 0, completed = 0;
async function worker() {
  while (cursor < queue.length) {
    const task = queue[cursor++];
    results[task.key] = { ...task, ...await capture(task) };
    if (++completed % 200 === 0 || completed === queue.length) console.log(`Preserved/checked ${completed}/${queue.length}`);
  }
}
await Promise.all(Array.from({ length: 6 }, worker));
const manifest = { schema_version: 1, snapshot_id: catalog.pointer.snapshot_id, captured_at: new Date().toISOString(), by_release: byRelease, resources: results };
await writeFile(resolve(snapshot, "media-mirror.json"), JSON.stringify(manifest) + "\n");
const icons = Object.fromEntries(Object.entries(byRelease).map(([id, row]) => [id, results[row.icon]?.path || null]));
await writeFile(resolve(output, "icons.json"), JSON.stringify({ snapshot_id: manifest.snapshot_id, icons }) + "\n");
const uniqueFiles = new Map(Object.values(results).filter((row) => row.path).map((row) => [row.path, row.bytes]));
const report = { image_contexts: queue.length, preserved: Object.values(results).filter((row) => row.status === "preserved").length, unavailable: Object.values(results).filter((row) => row.status === "unavailable").length, unique_display_files: uniqueFiles.size, display_bytes: [...uniqueFiles.values()].reduce((sum, bytes) => sum + bytes, 0), releases_with_preserved_icons: Object.values(icons).filter(Boolean).length };
report.reconstructed = Object.values(results).filter((row) => row.status === "reconstructed").length;
report.release_icon_references = [...catalog.projects.values()].reduce((sum, project) => sum + project.releases.filter((release) => release.icon_url).length, 0);
await writeFile(resolve(snapshot, "media-mirror-report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));

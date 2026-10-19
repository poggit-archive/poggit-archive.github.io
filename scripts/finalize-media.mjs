// Apply verified ZIP recoveries, freeze safe SVG rasterizations and replace
// dead Poggit badges with explicitly reconstructed snapshot information.
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { getCatalog, escapeHtml, apiRanges, number } from "../src/lib/plugin-details.mjs";
import { displayImage } from "../src/lib/preserved-image.mjs";

const catalog = getCatalog();
const media = catalog.media;
const snapshot = resolve("data/snapshots", catalog.pointer.snapshot_id);
let recovered = {};
try { recovered = JSON.parse(await readFile(resolve("archive/media-git/index.json"), "utf8")); } catch (error) { if (error.code !== "ENOENT") throw error; }
if (process.argv.includes("--followup")) {
  const priority = (row) => row.revision_verified === true ? 4 : row.method === "wayback_capture" ? 3 : row.method === "verified_phar_entry" ? 2 : 1;
  for (const filename of ["index", "repository-index", "fork-index", "local-index", "history-index", "cdx-related-index"]) {
    let rows = {};
    try { rows = JSON.parse(await readFile(resolve(`archive/media-followup/${filename}.json`), "utf8")); } catch (error) { if (error.code !== "ENOENT") throw error; }
    for (const [key, row] of Object.entries(rows)) {
      if (!/^[a-f0-9]{64}\.image$/.test(row.file) || row.file !== `${row.sha256}.image`) throw new Error("Invalid recovery file identity");
      if (!recovered[key] || priority(row) > priority(recovered[key])) recovered[key] = { ...row, recovery_directory: "archive/media-followup", recovery_batch: "missing-media-2026-10-19" };
    }
  }
}
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function save(data) {
  const display = await displayImage(data);
  const sha = hash(display.bytes);
  const path = `/archive-media/${sha}.${display.extension}`;
  await writeFile(resolve("public", path.slice(1)), display.bytes);
  const originalSha = hash(data);
  const originalPath = display.transformed ? `/archive-media/${originalSha}.svg.txt` : path;
  if (display.transformed) await writeFile(resolve("public", originalPath.slice(1)), data);
  return { path, sha256: sha, bytes: display.bytes.length, original_path: originalPath, original_sha256: originalSha, original_bytes: data.length, width: display.width, height: display.height };
}
for (const resource of Object.values(media.resources)) {
  if (resource.status === "preserved" && resource.original_path?.endsWith(".svg.txt")) {
    const source = await readFile(resolve("public", resource.original_path.slice(1)));
    if (hash(source) !== resource.original_sha256) throw new Error("Original SVG checksum mismatch");
    Object.assign(resource, await save(source));
  } else if (resource.status !== "preserved" && recovered[resource.key]) {
    const recovery = recovered[resource.key];
    const data = await readFile(resolve(recovery.recovery_directory || "archive/media-git", recovery.file));
    if (hash(data) !== recovery.sha256) throw new Error("Recovered Git image checksum mismatch");
    try {
      const { file, sha256, recovery_directory, ...provenance } = recovery;
      if (provenance.method === "wayback_capture") {
        const archivedUrl = provenance.archived_original_url || provenance.fetched_url.split(/\/web\/\d{14}id_\//)[1];
        provenance.capture_scope = decodeURI(archivedUrl) === decodeURI(resource.capture_url) ? "original_url" : "same_repository_other_revision";
      }
      Object.assign(resource, await save(data), { ...provenance, status: "preserved", captured_at: new Date().toISOString() });
    } catch (error) { (resource.attempts ||= []).push(`Verified ZIP image: ${error.message}`); }
  }
  if (resource.status !== "preserved") {
    const url = new URL(resource.capture_url);
    if (url.hostname === "poggit.pmmp.io") {
      const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
      let detail, project;
      if (/^shield\.(dl(?:\.total)?|downloads(?:\.total)?|api|state|approved)$/.test(parts[0])) {
        const candidates = [...(catalog.byName.get((parts[1] || "").toLowerCase()) || [])];
        if (candidates.length === 1) {
          project = candidates[0];
          if (/^shield\.(dl|downloads)/.test(parts[0])) detail = `${number(project.totalDownloads)} total downloads`;
          if (parts[0] === "shield.api") detail = `API ${apiRanges(project.latest)}`;
          if (["shield.state", "shield.approved"].includes(parts[0])) detail = project.latest.state_name;
        }
      } else if (["ci.shield", "ci.badge"].includes(parts[0])) detail = "CI historical reference";
      if (detail) {
        const width = Math.min(700, Math.max(240, 128 + detail.length * 7));
        const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="24"><rect width="${width}" height="24" fill="#f0f0f0"/><rect width="116" height="24" fill="#404040"/><text x="8" y="16" font-family="sans-serif" font-size="11" fill="#ffffff">Archive snapshot</text><text x="124" y="16" font-family="sans-serif" font-size="11" fill="#404040">${escapeHtml(detail)}</text></svg>`);
        const generated = await save(svg);
        const { original_path, original_sha256, original_bytes, ...display } = generated;
        Object.assign(resource, display, { status: "reconstructed", method: "snapshot_metadata_label", generated_svg_path: original_path, generated_svg_sha256: original_sha256, generated_svg_bytes: original_bytes, source_snapshot_id: catalog.pointer.snapshot_id, source_project_id: project?.id, label: detail, note: "Replacement generated from saved metadata or a historical CI reference. This is not the original Poggit badge.", captured_at: new Date().toISOString() });
      }
    }
  }
  // Resume checkpoints retain the final local file identity as well.
  await writeFile(resolve("archive/media-captures", resource.key + ".json"), JSON.stringify(resource));
}
media.captured_at = new Date().toISOString();
await writeFile(resolve(snapshot, "media-mirror.json"), JSON.stringify(media) + "\n");
const used = new Set(Object.values(media.resources).flatMap((row) => [row.path, row.original_path, row.generated_svg_path]).filter(Boolean).map((path) => path.split("/").at(-1)));
// This directory is the output owned by the media importer. Remove only
// unreferenced hash-named files generated during this capture, not other files.
for (const filename of await readdir(resolve("public/archive-media"))) {
  if (/^[a-f0-9]{64}\.(png|jpg|gif|webp|avif|svg\.txt)$/.test(filename) && !used.has(filename)) await unlink(resolve("public/archive-media", filename));
}
const displayFiles = new Map(Object.values(media.resources).filter((row) => row.path).map((row) => [row.path, row.bytes]));
const icons = Object.fromEntries(Object.entries(media.by_release).map(([id, row]) => [id, media.resources[row.icon]?.path || null]));
await writeFile(resolve("public/archive-media/icons.json"), JSON.stringify({ snapshot_id: media.snapshot_id, icons }) + "\n");
const report = { image_contexts: Object.keys(media.resources).length, preserved: Object.values(media.resources).filter((row) => row.status === "preserved").length, reconstructed: Object.values(media.resources).filter((row) => row.status === "reconstructed").length, unavailable: Object.values(media.resources).filter((row) => row.status === "unavailable").length, unique_display_files: displayFiles.size, display_bytes: [...displayFiles.values()].reduce((sum, bytes) => sum + bytes, 0), releases_with_preserved_icons: Object.values(icons).filter(Boolean).length };
report.reconstructed = Object.values(media.resources).filter((row) => row.status === "reconstructed").length;
report.release_icon_references = [...catalog.projects.values()].reduce((sum, project) => sum + project.releases.filter((release) => release.icon_url).length, 0);
await writeFile(resolve(snapshot, "media-mirror-report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));

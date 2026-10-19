// Import only bytes whose capture URLs were read from Chrome's rendered CDX
// documents. The Chrome investigation is separate from normal offline builds.
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { brotliDecompressSync, gunzipSync } from "node:zlib";
import sharp from "sharp";
import { archiveUrl, getCatalog } from "../src/lib/plugin-details.mjs";
import { displayImage } from "../src/lib/preserved-image.mjs";

const catalog = getCatalog();
const media = catalog.media;
const directory = resolve("data/snapshots", catalog.pointer.snapshot_id);
const workspace = resolve("archive/media-chrome");
const json = async (name) => JSON.parse(await readFile(resolve(workspace, name), "utf8"));
const baseline = await json("baseline.json");
const browser = await json("chrome-audit.json");
const captures = await json("downloads.json");
const originals = await json("originals.json");
const derivatives = await json("animated-derivatives.json");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const now = new Date().toISOString();

async function localImage(bytes) {
  const image = await displayImage(bytes);
  const sha256 = hash(image.bytes);
  const path = `/archive-media/${sha256}.${image.extension}`;
  await writeFile(resolve("public", path.slice(1)), image.bytes);
  const originalSha = hash(bytes);
  const originalPath = image.transformed ? `/archive-media/${originalSha}.svg.txt` : path;
  if (image.transformed) await writeFile(resolve("public", originalPath.slice(1)), bytes);
  return { path, sha256, bytes: image.bytes.length, width: image.width, height: image.height, original_path: originalPath, original_sha256: originalSha, original_bytes: bytes.length };
}

for (const capture of captures) {
  if (capture.result !== "downloaded") continue;
  const evidence = browser.results.find((row) => row.lookup === "all_mime_types" && row.url === capture.url && row.successful_captures?.some((row) => row[0] === capture.wayback_timestamp && row[1] === capture.url));
  if (!evidence) throw new Error("Capture is not backed by Chrome CDX evidence");
  const source = await readFile(resolve(workspace, capture.file));
  if (source.length !== capture.bytes || hash(source) !== capture.sha256) throw new Error("Downloaded capture checksum mismatch");
  let identity;
  const conversion = derivatives.find((row) => row.original_sha256 === capture.sha256);
  if (conversion) {
    const original = originals.find((row) => row.sha256 === capture.sha256);
    if (!original || !archiveUrl(original.url) || original.digest !== `sha256:${capture.sha256}` || original.bytes !== source.length) throw new Error("GIF original is not verified in the owned archive");
    const bytes = await readFile(resolve(workspace, conversion.file));
    if (hash(bytes) !== conversion.sha256 || bytes.length !== conversion.bytes) throw new Error("WebP derivative checksum mismatch");
    const metadata = await sharp(bytes).metadata();
    if (metadata.pages !== conversion.transformation.pages || JSON.stringify(metadata.delay) !== JSON.stringify(conversion.transformation.delay)) throw new Error("Animation metadata mismatch");
    const path = `/archive-media/${conversion.sha256}.webp`;
    await writeFile(resolve("public", path.slice(1)), bytes);
    identity = { path, sha256: conversion.sha256, bytes: bytes.length, width: metadata.width, height: metadata.height, original_sha256: capture.sha256, original_bytes: source.length, original_archive: original, display_transformation: conversion.transformation };
  } else {
    let decoded = source;
    let encoding;
    if (capture.cdx_mime === "image/svg+xml" && !/<svg[\s>]/i.test(source.subarray(0, 65536).toString())) {
      encoding = source[0] === 0x1f && source[1] === 0x8b ? "gzip" : "br";
      decoded = (encoding === "gzip" ? gunzipSync : brotliDecompressSync)(source, { maxOutputLength: 16 * 1024 * 1024 });
      if (!/<svg[\s>]/i.test(decoded.subarray(0, 65536).toString())) throw new Error("Decoded capture is not SVG");
    }
    identity = await localImage(decoded);
    if (encoding) Object.assign(identity, { http_content_encoding: encoding, encoded_response_sha256: capture.sha256, encoded_response_bytes: source.length });
  }
  for (const key of capture.keys) {
    const resource = media.resources[key];
    if (!baseline[key]) throw new Error("Capture is outside this investigation's baseline");
    if (resource.status === "preserved") continue;
    Object.assign(resource, identity, { status: "preserved", method: "wayback_capture", fetched_url: capture.capture_url, wayback_timestamp: capture.wayback_timestamp, archived_original_url: capture.url, capture_scope: "original_url", revision_verified: false, captured_at: now, recovery_batch: "chrome-wayback-2026-10-19", cdx_mime: capture.cdx_mime, capture_transport: capture.transport, note: "Capture located in Chrome using an unfiltered CDX lookup. Release-time image identity is not independently verified." });
  }
}

// Both URLs occur in the saved Track descriptions. Keep this related copy
// explicitly distinct from an original-URL capture.
const source = Object.values(media.resources).find((row) => row.capture_url === "https://raw.githubusercontent.com/NhanAZ/Images/master/handlefont.jpg" && row.status === "preserved");
const related = Object.values(media.resources).find((row) => row.capture_url === "https://raw.githubusercontent.com/NhanAZ/Track/main/images/handlefont.jpg");
if (source && related?.status === "unavailable") {
  const bytes = await readFile(resolve("public", source.original_path.slice(1)));
  Object.assign(related, await localImage(bytes), { status: "preserved", method: "wayback_capture", fetched_url: source.fetched_url, wayback_timestamp: source.wayback_timestamp, archived_original_url: source.capture_url, capture_scope: "related_repository_url", source_resource_key: source.key, revision_verified: false, captured_at: now, recovery_batch: "chrome-wayback-2026-10-19", note: "Related Track screenshot recovered from the author's Images repository. The original Track image URL has no successful capture; equivalence at each release revision is unverified." });
}

for (const key of Object.keys(baseline)) {
  const resource = media.resources[key];
  if (resource.status !== "unavailable") continue;
  const check = browser.results.find((row) => row.lookup === "all_mime_types" && row.url === resource.capture_url);
  const message = resource.capture_url.includes("genboy.net/")
    ? "Chrome recheck 2026-10-19: no matching image in the unfiltered Genboy CDX index (111 URLs); saved Festival page still references missing uploads."
    : check?.result === "no_successful_capture" ? "Chrome recheck 2026-10-19: CDX lookup completed; no successful capture for this URL." : null;
  if (message && !resource.attempts.includes(message)) resource.attempts.push(message);
}

media.captured_at = now;
await writeFile(resolve(directory, "media-mirror.json"), JSON.stringify(media) + "\n");
const files = new Map(Object.values(media.resources).filter((row) => row.path).map((row) => [row.path, row.bytes]));
const icons = Object.fromEntries(Object.entries(media.by_release).map(([id, row]) => [id, media.resources[row.icon]?.path || null]));
await writeFile(resolve("public/archive-media/icons.json"), JSON.stringify({ snapshot_id: media.snapshot_id, icons }) + "\n");
const report = { image_contexts: Object.keys(media.resources).length, preserved: 0, reconstructed: 0, unavailable: 0, unique_display_files: files.size, display_bytes: [...files.values()].reduce((sum, bytes) => sum + bytes, 0), releases_with_preserved_icons: Object.values(icons).filter(Boolean).length, release_icon_references: catalog.mediaReport.release_icon_references };
for (const resource of Object.values(media.resources)) report[resource.status]++;
await writeFile(resolve(directory, "media-mirror-report.json"), JSON.stringify(report, null, 2) + "\n");

const records = Object.fromEntries(Object.keys(baseline).map((key) => [key, media.resources[key]]));
const chromeReport = {
  schema_version: 1, snapshot_id: media.snapshot_id, checked_at: now,
  baseline_unavailable: Object.keys(baseline).length,
  recovered: Object.values(records).filter((row) => row.status === "preserved").length,
  remaining: report.unavailable,
  original_url_captures: Object.values(records).filter((row) => row.status === "preserved" && row.capture_scope === "original_url").length,
  related_url_copies: Object.values(records).filter((row) => row.status === "preserved" && row.capture_scope === "related_repository_url").length,
  genboy: { contexts: 33, unique_image_urls: 31, recovered: 0, query_url: browser.genboy.unfiltered_cdx_url, indexed_urls: browser.genboy.unfiltered_captures.length - 1, matching_media_urls: browser.genboy.unfiltered_captures.slice(1).filter((row) => /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(row[1])), mime_types: [...new Set(browser.genboy.unfiltered_captures.slice(1).map((row) => row[2]))], logo_replay_url: browser.genboy.logo_replay_url, logo_result: browser.genboy.logo_result, pages_checked: browser.genboy.pages_checked },
  url_checks: browser.results.filter((row) => row.lookup === "all_mime_types"),
  records,
};
await writeFile(resolve(directory, "media-chrome-audit.json"), JSON.stringify(chromeReport) + "\n");
console.log(JSON.stringify({ ...chromeReport, records: undefined, url_checks: undefined }, null, 2));

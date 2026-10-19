import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { archiveUrl, getCatalog, versionApiLabel } from "../src/lib/plugin-details.mjs";

const catalog = getCatalog();
if (!catalog.media.schema_version) throw new Error("Preserved media manifest is missing. Run the explicit preservation import first.");
if (!catalog.files.schema_version) throw new Error("Preserved file manifest is missing. Run preserve_downloads.py first.");
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const verified = new Set();
for (const [remote, item] of Object.entries(catalog.files.resources)) {
  if (!archiveUrl(remote) || !/^\/archive-files\/[a-f0-9]{64}\.(phar|zip)$/.test(item.path)) throw new Error("Unsafe preserved download identity");
  const bytes = await readFile(resolve("public", item.path.slice(1)));
  if (bytes.length !== item.bytes || digest(bytes) !== item.sha256) throw new Error(`Preserved download checksum mismatch: ${item.path}`);
}
await mkdir(resolve("public/archive-files"), { recursive: true });
await writeFile(resolve("public/archive-files/manifest.json"), JSON.stringify(catalog.files) + "\n");
for (const resource of Object.values(catalog.media.resources)) {
  if (!["preserved", "reconstructed"].includes(resource.status)) continue;
  if (resource.original_archive) {
    const original = resource.original_archive;
    if (!archiveUrl(original.url) || original.status !== "uploaded" || original.digest !== `sha256:${resource.original_sha256}` || original.sha256 !== resource.original_sha256 || original.bytes !== resource.original_bytes || resource.original_path) throw new Error("Unverified archived media original");
  } else if (!resource.original_path && !resource.generated_svg_path) throw new Error("Preserved media original is missing");
  for (const [path, sha] of [[resource.path, resource.sha256], [resource.original_path || resource.generated_svg_path, resource.original_sha256 || resource.generated_svg_sha256]]) {
    if (!path && resource.original_archive) continue;
    if (!/^\/archive-media\/[a-f0-9]{64}\.(png|jpg|gif|webp|avif|svg\.txt)$/.test(path)) throw new Error("Unsafe preserved media path");
    if (verified.has(path)) continue;
    if (digest(await readFile(resolve("public", path.slice(1)))) !== sha) throw new Error(`Preserved media checksum mismatch: ${path}`);
    verified.add(path);
  }
}
await mkdir(resolve("public/archive-media"), { recursive: true });
const icons = Object.fromEntries(Object.entries(catalog.media.by_release).map(([id, row]) => [id, catalog.media.resources[row.icon]?.path || null]));
await writeFile(resolve("public/archive-media/icons.json"), JSON.stringify({ snapshot_id: catalog.pointer.snapshot_id, icons }) + "\n");
const apis = Object.fromEntries([...catalog.projects.values()].flatMap((project) => project.releases.map((release) => [release.id, versionApiLabel(release)])));
await mkdir(resolve("public/plugin-documents"), { recursive: true });
await writeFile(resolve("public/plugin-documents/apis.json.gz"), gzipSync(JSON.stringify({ schema_version: 1, apis })));
for (const project of catalog.projects.values()) for (const release of project.releases) {
  const record = catalog.details.records[String(release.id)];
  const directory = resolve("public/plugin-documents", String(release.id));
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, "info.json"), JSON.stringify({ ...release, archive_provenance: { snapshot_id: catalog.pointer.snapshot_id, official_archive_revision: catalog.details.archive_revision, official_archive_path: record.archive_path || null, phar: record.phar } }, null, 2) + "\n");
  for (const [filename, document] of Object.entries(record.documents || {})) {
    if (!["description.html", "description.txt", "changelog.html", "changelog.txt", "LICENSE.txt"].includes(filename)) throw new Error("Unexpected archived document filename");
    const content = Buffer.from(document.content);
    if (digest(content) !== document.sha256) throw new Error(`Archived document checksum mismatch: ${release.id}/${filename}`);
    // HTML is delivered as a text document, never as an executable HTML page.
    await writeFile(resolve(directory, filename + ".txt"), content);
  }
  if (record.manifest_text) await writeFile(resolve(directory, "plugin.yml.txt"), record.manifest_text);
  if (record.phar_license?.content) await writeFile(resolve(directory, "phar-license.txt"), record.phar_license.content);
}
console.log(`Prepared local release documents and verified ${verified.size} preserved media files. No network requests.`);

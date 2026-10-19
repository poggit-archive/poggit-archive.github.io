import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { getCatalog, archiveUrl, fileUrl } from "./plugin-details.mjs";

const segment = (value) => String(value).toLowerCase().replace(/[^a-z0-9_.-]/g, "-");
export const virionPath = (item) => `/virions/${[item.owner, item.repo, item.project].map(segment).join("/")}/`;
export const virionAuthorPath = (name) => `/?type=virions&author=${encodeURIComponent(name)}`;
let cached;
export function getVirionCatalog() {
  if (cached) return cached;
  const pluginCatalog = getCatalog();
  const folder = resolve("data/snapshots", pluginCatalog.pointer.snapshot_id);
  const read = (name) => JSON.parse(readFileSync(resolve(folder, name), "utf8"));
  const capture = JSON.parse(gunzipSync(readFileSync(resolve("src/data/virion-details.json.gz"))));
  if (capture.snapshot_id !== pluginCatalog.pointer.snapshot_id) throw new Error("Virion document snapshot mismatch");
  const items = read("virions.json"), downloads = read("downloads-virions.json"), sources = read("virion-source-downloads.json");
  const index = resolve("public/virion-documents/index.json");
  const documentUrl = existsSync(index) ? JSON.parse(readFileSync(index, "utf8")).path : null;
  const users = new Map(items.map((item) => [item.id, []]));
  for (const project of pluginCatalog.projects.values()) {
    for (const item of items) {
      const release = project.releases.find((release) => (release.virions || []).some((dependency) => dependency.repo_name?.toLowerCase() === `${item.owner}/${item.repo}`.toLowerCase() && (dependency.project_name || dependency.name)?.toLowerCase() === item.project.toLowerCase()));
      if (release) users.get(item.id).push({ name: project.latest.name, path: project.path, version: release.version });
    }
  }
  cached = { items, downloads, sources, capture, documentUrl, users, pluginCatalog, files: pluginCatalog.files };
  return cached;
}

export function virionView(item, catalog = getVirionCatalog()) {
  const source = catalog.sources[item.id], download = catalog.downloads[item.id] || {}, record = catalog.capture.records[item.id];
  let artifact = null, preservedSource = null;
  if (download.status === "uploaded" && archiveUrl(download.remote_url)) artifact = { ...download, label: "Archived PHAR", original: true };
  else if (download.rebuilt_artifact?.status === "uploaded" && archiveUrl(download.rebuilt_artifact.remote_url)) artifact = { ...download.rebuilt_artifact, label: "Rebuilt PHAR", original: false };
  if (source?.status === "uploaded" && archiveUrl(source.remote_url)) {
    if (source.method === "unphar" && source.complete_git_snapshot === false) preservedSource = { ...source, label: "Source from PHAR", note: "Distribution files recovered from the original PHAR. The complete Git source tree is unavailable." };
    else if (source.method === "git_archive" && source.complete_git_snapshot === true && /^[a-f0-9]{40}$/.test(source.verified_revision || "") && ["original_poggit_build", "rebuilt_phar"].includes(source.source_scope)) {
      const original = source.source_scope === "original_poggit_build";
      preservedSource = { ...source, label: original ? "Archived source" : "Rebuild source", note: original ? "Source at the preserved original PHAR's build revision, or an exact catalog build match." : "Source used to reconstruct the PHAR. The original Poggit build revision remains unconfirmed." };
    }
  }
  const manifest = record.manifest || {}, composer = record.composer || {};
  const license = source?.license_display || item.license || "No License";
  const namespace = manifest.antigen || composer.extra?.virion?.["namespace-root"] || item.namespace;
  const pharVersion = manifest.version != null ? String(manifest.version) : artifact?.virion_version || null;
  const versionSource = pharVersion
    ? manifest.version != null
      ? ({ original_phar: "Archived PHAR manifest", rebuilt_phar: "Rebuilt PHAR manifest" })[record.manifest_origin] || "Preserved source manifest"
      : `${artifact.label} metadata`
    : item.version ? "Preserved catalog" : null;
  return {
    record, manifest, composer, source: preservedSource && { ...preservedSource, url: fileUrl(preservedSource.remote_url, catalog.files) },
    artifact: artifact && { ...artifact, url: fileUrl(artifact.remote_url, catalog.files) },
    license: ["", "none", "unknown"].includes(String(license).trim().toLowerCase()) ? "No License" : license,
    version: pharVersion || item.version || "Not preserved", pharVersion, versionSource,
    namespace,
    api: Array.isArray(manifest.api) ? manifest.api.map(String).join(", ") : manifest.api != null ? String(manifest.api) : "Not recorded",
    description: composer.description || `Preserved PocketMine-MP library in the ${namespace} namespace.`,
    users: catalog.users.get(item.id) || [],
  };
}

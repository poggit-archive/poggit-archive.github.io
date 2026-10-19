import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import sanitizeHtml from "sanitize-html";
import { imageUrl } from "./media-urls.mjs";

export const slug = (name) => String(name || "plugin").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "plugin";
export const projectPath = (release) => `/plugins/${release.project_id}-${slug(release.name)}/`;
export const versionPath = (project, release) => `${project.path}${release.id}/`;
export const authorPath = (name) => `/?author=${encodeURIComponent(name)}`;
export const number = (value) => new Intl.NumberFormat("en-US").format(Number(value) || 0);
export const date = (value) => value ? new Date(Number(value) * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "Not recorded";
export const text = (value) => value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
export const list = (value) => (Array.isArray(value) ? value : value == null ? [] : [value]).map(text);
export const apiRanges = (release) => (release.api || []).map(({ from, to }) => from === to ? from : `${from} – ${to}`).join(", ") || "Not recorded";
export const versionApiLabel = (release) => (release.api || []).length ? `API ${apiRanges(release).replaceAll(" – ", " - ")}` : "API not recorded";

export function archiveUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "github.com" && url.pathname.startsWith("/poggit-archive/artifacts/releases/download/");
  } catch { return false; }
}

export function fileUrl(value, mirror) {
  if (!archiveUrl(value)) return value;
  const local = mirror?.resources?.[value];
  return /^\/archive-files\/[a-f0-9]{64}\.(phar|zip)$/.test(local?.path || "") ? local.path : value;
}

export function sourceArtifact(release, sources, recovered, mirror) {
  const source = sources[`${release.repo_id}@${String(release.build_commit).toLowerCase()}`];
  if (source?.status === "uploaded" && archiveUrl(source.remote_url)) return { label: "Archived source", url: fileUrl(source.remote_url, mirror), backupUrl: source.remote_url, note: "Git repository at the original Poggit build commit." };
  const fallback = recovered[String(release.id)];
  return fallback?.status === "uploaded" && fallback.method === "unphar" && fallback.complete_git_snapshot === false && archiveUrl(fallback.remote_url)
    ? { label: "Source from PHAR", url: fileUrl(fallback.remote_url, mirror), backupUrl: fallback.remote_url, note: "Files extracted from the original PHAR. Repository files excluded during the build may be missing." } : null;
}

export const escapeHtml = (value) => text(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

// Descriptions are untrusted archived HTML. No scripts, styles, embeds, forms,
// event attributes, data URLs or arbitrary protocols reach the generated page.
export function cleanDocument(document, release, catalog) {
  if (!document) return "";
  if (document.format === "txt") return `<pre class="plain-document">${escapeHtml(document.content)}</pre>`;
  const base = `https://github.com/${release.repo_name}/blob/${release.build_commit}/`;
  const idPrefix = `archived-${document.filename?.startsWith("changelog") ? "changelog" : "description"}-`;
  const documentId = (value) => idPrefix + value.replace(/^user-content-/, "");
  const resolve = (value, image = false) => {
    try {
      if (!value) return undefined;
      if (value.startsWith("#")) return image ? undefined : `#${documentId(value.slice(1))}`;
      const url = new URL(value, base);
      if (!["https:", "http:", ...(image ? [] : ["mailto:"])].includes(url.protocol)) return undefined;
      if (image && url.hostname === "github.com" && url.pathname.includes("/blob/")) {
        url.hostname = "raw.githubusercontent.com";
        url.pathname = url.pathname.replace("/blob/", "/");
      }
      return catalog ? localReference(url.href, release, catalog) : url.href;
    } catch { return undefined; }
  };
  return sanitizeHtml(document.content, {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, "img", "details", "summary", "del", "s", "kbd", "samp", "sub", "sup"],
    allowedAttributes: { a: ["href", "title", "id", "rel"], img: ["src", "alt", "title", "width", "height", "loading", "decoding", "referrerpolicy"], th: ["colspan", "rowspan"], td: ["colspan", "rowspan"], ol: ["start"], code: [], "*": ["id"] },
    allowedSchemes: ["https", "http", "mailto"],
    allowProtocolRelative: false,
    disallowedTagsMode: "discard",
    transformTags: {
      "*": (tagName, attributes) => ({ tagName, attribs: { ...attributes, ...(attributes.id ? { id: documentId(attributes.id) } : {}) } }),
      a: (tagName, attributes) => ({ tagName, attribs: { ...attributes, href: resolve(attributes.href), rel: "nofollow noopener noreferrer" } }),
      img: (tagName, attributes) => {
        const original = imageUrl(attributes.src, release);
        if (!original) return { tagName, attribs: {} };
        const local = mediaFor(original, release, catalog);
        const dimensions = Number.isInteger(local?.width) && local.width > 0 && Number.isInteger(local?.height) && local.height > 0 ? { width: String(local.width), height: String(local.height) } : {};
        return { tagName, attribs: { src: local?.path || "/assets/image-unavailable.svg", alt: attributes.alt || (local ? "Preserved image" : "Image not preserved"), title: mediaTitle(local), ...dimensions, loading: "lazy", decoding: "async" } };
      },
    },
    exclusiveFilter: (frame) => frame.tag === "img" && !frame.attribs.src,
  });
}

export function documentFor(record, kind) {
  for (const format of ["html", "txt"]) {
    const filename = `${kind}.${format}`;
    if (record.documents?.[filename]) return { ...record.documents[filename], filename, format };
  }
  return null;
}

let cached;
export function getCatalog() {
  if (cached) return cached;
  const root = resolve("data");
  const read = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
  const pointer = read("api/v1/current.json");
  const directory = `snapshots/${pointer.snapshot_id}/`;
  const releases = read(`${directory}releases.json`);
  const details = JSON.parse(gunzipSync(readFileSync(resolve(root, directory, "plugin-details.json.gz"))).toString("utf8"));
  const downloads = read(`${directory}downloads-plugins.json`);
  const sources = read(`${directory}source-downloads.json`);
  const recovered = read(`${directory}recovered-sources.json`);
  const media = existsSync(resolve(root, directory, "media-mirror.json")) ? read(`${directory}media-mirror.json`) : { resources: {}, by_release: {} };
  const mediaReport = existsSync(resolve(root, directory, "media-mirror-report.json")) ? read(`${directory}media-mirror-report.json`) : {};
  const files = existsSync(resolve(root, directory, "file-mirror.json")) ? read(`${directory}file-mirror.json`) : { resources: {} };
  const projects = new Map();
  for (const release of releases) {
    const key = String(release.project_id);
    if (!projects.has(key)) projects.set(key, { id: key, releases: [] });
    projects.get(key).releases.push(release);
  }
  for (const project of projects.values()) {
    project.releases.sort((a, b) => Number(b.id) - Number(a.id));
    project.latest = project.releases[0];
    project.path = projectPath(project.latest);
    project.totalDownloads = project.releases.reduce((sum, row) => sum + (Number(row.downloads) || 0), 0);
  }
  const byName = new Map(), byBuild = new Map(), resources = new Map();
  for (const project of projects.values()) for (const release of project.releases) {
    const name = release.name.toLowerCase();
    if (!byName.has(name)) byName.set(name, new Set());
    byName.get(name).add(project);
    byBuild.set(`${release.repo_name}/${release.project_name}/${release.build_number}`.toLowerCase(), { project, release });
    byBuild.set(`${release.repo_name}/${release.project_name}`.toLowerCase(), { project, release: project.latest });
    for (const [field, file] of [["description_url", "description"], ["changelog_url", "changelog"]]) {
      const document = documentFor(details.records[String(release.id)] || {}, file);
      if (release[field] && document && !release[field].endsWith("/0")) resources.set(release[field], `/plugin-documents/${release.id}/${document.filename}.txt`);
    }
    if (downloads[String(release.id)]?.status === "uploaded" && archiveUrl(downloads[String(release.id)].remote_url)) resources.set(release.artifact_url, fileUrl(downloads[String(release.id)].remote_url, files));
  }
  cached = { pointer, details, downloads, sources, recovered, projects, media, mediaReport, byName, byBuild, resources, files };
  return cached;
}

export function releaseView(release, catalog) {
  const record = catalog.details.records[String(release.id)] || {};
  const source = sourceArtifact(release, catalog.sources, catalog.recovered, catalog.files);
  const download = catalog.downloads[String(release.id)];
  const description = documentFor(record, "description");
  const changelog = documentFor(record, "changelog");
  const customLicense = record.documents?.["LICENSE.txt"];
  const licenseText = customLicense?.content?.trim() || record.phar_license?.content?.trim() || "";
  const declared = text(release.license).trim();
  const sourceLicense = catalog.sources[`${release.repo_id}@${release.build_commit}`]?.license_display;
  const license = !declared || ["none", "unknown", "no license"].includes(declared.toLowerCase()) || sourceLicense === "No License" || (customLicense && !customLicense.content.trim()) ? "No License" : declared;
  const rawDocumentUrl = (filename) => filename === "info.json" || record.documents?.[filename] ? `/plugin-documents/${release.id}/${filename === "info.json" ? filename : filename + ".txt"}` : null;
  const media = catalog.media.by_release[String(release.id)] || { images: {} };
  const images = Object.values(media.images).map((key) => catalog.media.resources[key]);
  const icon = catalog.media.resources[media.icon];
  const iconUrl = /^\/archive-media\/[a-f0-9]{64}\.(png|jpg|gif|webp|avif)$/.test(icon?.path || "") ? icon.path : "/assets/plugin.svg";
  return {
    record, manifest: record.manifest || {}, source,
    download: download?.status === "uploaded" && archiveUrl(download.remote_url) ? fileUrl(download.remote_url, catalog.files) : null,
    downloadBackup: download?.status === "uploaded" ? download.remote_url : null,
    descriptionHtml: cleanDocument(description, release, catalog), changelogHtml: cleanDocument(changelog, release, catalog),
    descriptionUrl: description && rawDocumentUrl(description.filename), changelogUrl: changelog && rawDocumentUrl(changelog.filename),
    license, licenseText, rawDocumentUrl,
    iconUrl,
    iconTitle: iconUrl === "/assets/plugin.svg" ? "Default plugin icon; original icon not preserved." : mediaTitle(icon),
    missingImages: images.filter((image) => !image?.path).length,
  };
}

export function mediaFor(value, release, catalog) {
  const key = catalog?.media.by_release[String(release.id)]?.images[value];
  const resource = catalog?.media.resources[key];
  return ["preserved", "reconstructed"].includes(resource?.status) ? resource : null;
}

export function mediaTitle(resource) {
  if (!resource || resource.status === "unavailable") return "Original image was unavailable during preservation.";
  if (resource.status === "reconstructed") return "Snapshot label reconstructed from saved metadata; original badge unavailable.";
  if (resource.method === "wayback_capture") return `Wayback Machine capture ${resource.wayback_timestamp}${resource.capture_scope && resource.capture_scope !== "original_url" ? " from another source URL or revision" : ""}; original release image identity is not independently verified.${resource.original_archive ? " Local WebP animation preview; original GIF archived separately." : ""}`;
  if (resource.method === "verified_phar_entry" && resource.revision_verified === false) return "Image recovered from the original PHAR; identity at the upstream image URL is not independently verified.";
  if (resource.revision_verified === false) return resource.note || "Preserved image from another revision; original release image identity is not verified.";
  return "Preserved copy";
}

export function localReference(value, release, catalog) {
  const url = new URL(value);
  const image = mediaFor(imageUrl(value, release), release, catalog);
  if (image) return image.path;
  if (!["poggit.pmmp.io", "poggit.jdcraft.net"].includes(url.hostname)) return value;
  const resource = catalog.resources.get(value.replace(/^http:/, "https:"));
  if (resource) return resource;
  const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const pluginIndex = parts.indexOf("p");
  if (pluginIndex !== -1 && parts[pluginIndex + 1]) {
    const candidates = [...(catalog.byName.get(parts[pluginIndex + 1].toLowerCase()) || [])];
    const project = candidates.find((project) => String(project.id) === String(release.project_id)) || (candidates.length === 1 ? candidates[0] : null);
    if (project) {
      const version = parts[pluginIndex + 2];
      if (!version) return project.path;
      const row = project.releases.find((row) => row.version.toLowerCase() === version.toLowerCase());
      if (row) return versionPath(project, row);
    }
  }
  const ciIndex = parts.indexOf("ci");
  if (ciIndex !== -1) {
    const build = catalog.byBuild.get(parts.slice(ciIndex + 1).join("/").toLowerCase());
    if (build) return versionPath(build.project, build.release) + "#build-record";
  }
  return "/preservation/#historical-links";
}

export function manifestRows(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value).map(([name, fields]) => ({ name, ...(fields && typeof fields === "object" && !Array.isArray(fields) ? fields : { description: fields }) }));
}

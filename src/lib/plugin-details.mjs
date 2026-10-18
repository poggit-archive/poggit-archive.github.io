import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import sanitizeHtml from "sanitize-html";

export const slug = (name) => String(name || "plugin").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "plugin";
export const projectPath = (release) => `/plugins/${release.project_id}-${slug(release.name)}/`;
export const versionPath = (project, release) => `${project.path}${release.id}/`;
export const number = (value) => new Intl.NumberFormat("en-US").format(Number(value) || 0);
export const date = (value) => value ? new Date(Number(value) * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "Not recorded";
export const text = (value) => value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
export const list = (value) => (Array.isArray(value) ? value : value == null ? [] : [value]).map(text);
export const apiRanges = (release) => (release.api || []).map(({ from, to }) => from === to ? from : `${from} – ${to}`).join(", ") || "Not recorded";

export function archiveUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "github.com" && url.pathname.startsWith("/poggit-archive/artifacts/releases/download/");
  } catch { return false; }
}

export function sourceArtifact(release, sources, recovered) {
  const source = sources[`${release.repo_id}@${String(release.build_commit).toLowerCase()}`];
  if (source?.status === "uploaded" && archiveUrl(source.remote_url)) return { label: "Archived source", url: source.remote_url, note: "Git repository at the original Poggit build commit." };
  const fallback = recovered[String(release.id)];
  return fallback?.status === "uploaded" && fallback.method === "unphar" && fallback.complete_git_snapshot === false && archiveUrl(fallback.remote_url)
    ? { label: "Source from PHAR", url: fallback.remote_url, note: "Files extracted from the original PHAR. Repository files excluded during the build may be missing." } : null;
}

export const escapeHtml = (value) => text(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

// Descriptions are untrusted archived HTML. No scripts, styles, embeds, forms,
// event attributes, data URLs or arbitrary protocols reach the generated page.
export function cleanDocument(document, release) {
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
      return url.href;
    } catch { return undefined; }
  };
  return sanitizeHtml(document.content, {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, "img", "details", "summary", "del", "s", "kbd", "samp", "sub", "sup"],
    allowedAttributes: { a: ["href", "title", "id", "rel"], img: ["src", "alt", "title", "loading", "decoding", "referrerpolicy"], th: ["colspan", "rowspan"], td: ["colspan", "rowspan"], ol: ["start"], code: [], "*": ["id"] },
    allowedSchemes: ["https", "http", "mailto"],
    allowProtocolRelative: false,
    disallowedTagsMode: "discard",
    transformTags: {
      "*": (tagName, attributes) => ({ tagName, attribs: { ...attributes, ...(attributes.id ? { id: documentId(attributes.id) } : {}) } }),
      a: (tagName, attributes) => ({ tagName, attribs: { ...attributes, href: resolve(attributes.href), rel: "nofollow noopener noreferrer" } }),
      img: (tagName, attributes) => ({ tagName, attribs: { src: resolve(attributes.src, true), alt: attributes.alt || "", title: attributes.title, loading: "lazy", decoding: "async", referrerpolicy: "no-referrer" } }),
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
  cached = { pointer, details, downloads, sources, recovered, projects };
  return cached;
}

export function releaseView(release, catalog) {
  const record = catalog.details.records[String(release.id)] || {};
  const source = sourceArtifact(release, catalog.sources, catalog.recovered);
  const download = catalog.downloads[String(release.id)];
  const description = documentFor(record, "description");
  const changelog = documentFor(record, "changelog");
  const customLicense = record.documents?.["LICENSE.txt"];
  const licenseText = customLicense?.content?.trim() || record.phar_license?.content?.trim() || "";
  const declared = text(release.license).trim();
  const sourceLicense = catalog.sources[`${release.repo_id}@${release.build_commit}`]?.license_display;
  const license = !declared || ["none", "unknown", "no license"].includes(declared.toLowerCase()) || sourceLicense === "No License" || (customLicense && !customLicense.content.trim()) ? "No License" : declared;
  const rawDocumentUrl = (filename) => record.archive_path ? `https://github.com/poggit/release-archive/blob/${catalog.details.archive_revision}/${record.archive_path.split("/").map(encodeURIComponent).join("/")}/${filename}` : null;
  return {
    record, manifest: record.manifest || {}, source,
    download: download?.status === "uploaded" && archiveUrl(download.remote_url) ? download.remote_url : null,
    descriptionHtml: cleanDocument(description, release), changelogHtml: cleanDocument(changelog, release),
    descriptionUrl: description && rawDocumentUrl(description.filename), changelogUrl: changelog && rawDocumentUrl(changelog.filename),
    license, licenseText, rawDocumentUrl,
  };
}

export function manifestRows(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value).map(([name, fields]) => ({ name, ...(fields && typeof fields === "object" && !Array.isArray(fields) ? fields : { description: fields }) }));
}

import { readFile, writeFile, mkdir, readdir, rm } from "node:fs/promises";
import { resolve, posix } from "node:path";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import sanitizeHtml from "sanitize-html";
import sharp from "sharp";
import { createSatteriMarkdownProcessor } from "@astrojs/markdown-satteri";
import { getVirionCatalog, virionView } from "../src/lib/virion-details.mjs";
import { cleanDocument } from "../src/lib/plugin-details.mjs";
import { imageUrl, frozenImageUrl } from "../src/lib/media-urls.mjs";
import { displayImage } from "../src/lib/preserved-image.mjs";

const digest = (data) => createHash("sha256").update(data).digest("hex");
const catalog = getVirionCatalog();
const registryPath = resolve("src/data/virion-media.json");
let registry;
try { registry = JSON.parse(await readFile(registryPath, "utf8")); } catch { registry = {}; }
const markdown = await createSatteriMarkdownProcessor({ syntaxHighlight: false, features: { smartPunctuation: false } });
const known = new Map(Object.values(catalog.pluginCatalog.media.resources).filter((row) => row.path).map((row) => [row.original_url, row]));
const documents = {}, records = {}, versions = {}, missingImages = [];
function addDocument(value) {
  const hash = digest(JSON.stringify(value));
  documents[hash] = value;
  return hash;
}
for (const item of catalog.items) {
  const view = virionView(item, catalog), capture = view.record;
  versions[item.id] = { version: view.versionSource ? view.version : null, source: view.versionSource };
  const source = catalog.sources[item.id];
  const release = { id: `virion:${item.id}`, repo_name: source?.source_repo || `${item.owner}/${item.repo}`, build_commit: source?.source_commit || "unknown" };
  const media = { ...catalog.pluginCatalog.media, resources: { ...catalog.pluginCatalog.media.resources }, by_release: { [release.id]: { images: {} } } };
  const context = { ...catalog.pluginCatalog, media };
  const payload = { licenses: [], files: {}, users: view.users, missingImages: 0 };
  for (const [kind, document] of Object.entries(capture.documents)) {
    if (digest(document.content) !== document.text_sha256) throw new Error(`Virion text checksum mismatch: ${item.id}/${document.path}`);
    if (!["readme", "changelog"].includes(kind)) { payload.files[kind] = addDocument({ text: document.content, path: document.path, sha256: document.sha256 }); continue; }
    let html = /\.(md|markdown)$/i.test(document.path) ? (await markdown.render(document.content)).code : `<pre>${document.content.replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</pre>`;
    const base = `https://github.com/${release.repo_name}/blob/${release.build_commit}/${posix.dirname(document.path) === "." ? "" : posix.dirname(document.path) + "/"}`;
    const imageSources = [];
    html = sanitizeHtml(html, { allowedTags: [...sanitizeHtml.defaults.allowedTags, "img", "details", "summary"], allowedAttributes: false, transformTags: {
      a: (tagName, attrs) => {
        let href = attrs.href;
        if (href && !href.startsWith("#")) { try { href = /^(?:LICENSE|LICENCE|COPYING)(?:\.[^/]*)?$/i.test(href) ? "#virion-license-document" : new URL(href, base).href; } catch { href = ""; } }
        return { tagName, attribs: { ...attrs, href } };
      },
      img: (tagName, attrs) => { let src; try { src = new URL(attrs.src, base).href; } catch { src = ""; } if (src) imageSources.push(src); return { tagName, attribs: { ...attrs, src } }; },
    } });
    for (const original of imageSources) {
      const normalized = imageUrl(original, release), frozen = frozenImageUrl(original, release);
      let local = known.get(frozen) || known.get(normalized);
      if (!local && source) {
        const url = new URL(frozen), parts = url.pathname.slice(1).split("/");
        if (url.hostname === "raw.githubusercontent.com" && parts.slice(0, 2).join("/").toLowerCase() === release.repo_name.toLowerCase()) {
          const path = parts.slice(3).map(decodeURIComponent).join("/");
          const image = capture.source_images[path];
          if (image && !registry[image.sha256] && process.argv.includes("--import-images")) {
            try {
              const bytes = await readFile(resolve("archive/virion-details/images", image.sha256));
              if (digest(bytes) !== image.sha256) throw new Error("Source image checksum mismatch");
              const display = await displayImage(bytes);
              const output = await sharp(display.bytes, { animated: true, limitInputPixels: 40000000 }).resize({ width: 960, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
              const meta = await sharp(output, { animated: true }).metadata();
              const sha256 = digest(output), path = `/virion-media/${sha256}.webp`;
              await mkdir(resolve("public/virion-media"), { recursive: true });
              await writeFile(resolve("public", path.slice(1)), output);
              registry[image.sha256] = { status: "preserved", path, sha256, bytes: output.length, width: meta.width, height: meta.pageHeight || meta.height, method: "verified_virion_zip", original_sha256: image.sha256 };
            } catch { /* Unsupported media keeps a local placeholder and original ZIP attribution. */ }
          }
          local = image && registry[image.sha256];
        }
      }
      if (local) {
        const key = `virion-${digest(normalized)}`;
        media.resources[key] = local;
        media.by_release[release.id].images[normalized] = key;
      } else { payload.missingImages++; missingImages.push({ id: item.id, document: document.path, url: original }); }
    }
    const safeHtml = cleanDocument({ format: "html", content: html, filename: `${kind === "changelog" ? "changelog" : "description"}.html` }, release, context).replaceAll(/href="#archived-(?:description|changelog)-virion-license-document"/g, 'href="#license"');
    payload[kind] = addDocument({ html: safeHtml, text: document.content, path: document.path, scope: document.scope, sha256: document.sha256 });
  }
  for (const license of capture.licenses) {
    if (digest(license.content) !== license.text_sha256) throw new Error("Virion license checksum mismatch");
    payload.licenses.push({ path: license.path, document: addDocument({ text: license.content }) });
  }
  if (capture.manifest_document) payload.files.manifest = addDocument({ text: capture.manifest_document.content, path: capture.manifest_document.path, sha256: capture.manifest_document.sha256 });
  records[item.id] = payload;
}
if (process.argv.includes("--import-images")) await writeFile(registryPath, JSON.stringify(registry, null, 2) + "\n");
for (const image of Object.values(registry)) if (digest(await readFile(resolve("public", image.path.slice(1)))) !== image.sha256) throw new Error("Virion display image checksum mismatch");
const bytes = gzipSync(JSON.stringify({ schema_version: 1, records, documents }));
const path = `/virion-documents/${digest(bytes)}.json.gz`;
const directory = resolve("public/virion-documents");
await mkdir(directory, { recursive: true });
for (const name of await readdir(directory)) if (/^[a-f0-9]{64}\.json\.gz$/.test(name)) await rm(resolve(directory, name));
await writeFile(resolve("public", path.slice(1)), bytes);
await writeFile(resolve(directory, "index.json"), JSON.stringify({ snapshot_id: catalog.capture.snapshot_id, path, sha256: digest(bytes), bytes: bytes.length, versions }) + "\n");
await writeFile(resolve("data/snapshots", catalog.capture.snapshot_id, "virion-details-report.json"), JSON.stringify({ ...catalog.capture.report, display_images: Object.keys(registry).length, unavailable_image_references: missingImages.length, missing_images: missingImages }, null, 2) + "\n");
console.log(`Prepared ${catalog.items.length} virion pages: ${Object.keys(documents).length} unique documents, ${bytes.length} compressed bytes, ${Object.keys(registry).length} local image previews. No network requests.`);

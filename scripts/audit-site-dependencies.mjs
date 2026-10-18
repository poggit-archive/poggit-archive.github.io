import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { resolve, relative, dirname } from "node:path";
import sanitizeHtml from "sanitize-html";

const root = resolve(process.argv[2] || "dist");
const origin = "https://poggit-archive.github.io";
const failures = [], outgoing = {}, localFiles = new Set(), localLinks = new Set();
let htmlPages = 0, totalBytes = 0;
async function files(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) output.push(...await files(path));
    else if (entry.isFile()) { output.push(path); totalBytes += (await stat(path)).size; }
  }
  return output;
}
function dependency(value, page) {
  if (!value || value.startsWith("#")) return;
  const base = new URL(relative(root, page).replaceAll("\\", "/"), origin + "/");
  const url = new URL(value, base);
  if (url.origin !== origin) { failures.push({ page: relative(root, page), url: url.href, error: "External runtime dependency" }); return; }
  localFiles.add(decodeURIComponent(url.pathname));
}
for (const path of await files(root)) {
  if (path.endsWith(".html")) {
    htmlPages++;
    const content = await readFile(path, "utf8");
    sanitizeHtml(content, { allowedTags: [], transformTags: { "*": (tagName, attributes) => {
      const attribute = { img: "src", script: "src", iframe: "src", source: "src", video: "src", audio: "src", embed: "src", object: "data" }[tagName];
      if (attribute) dependency(attributes[attribute], path);
      if (tagName === "video") dependency(attributes.poster, path);
      if (attributes.srcset) for (const item of attributes.srcset.split(",")) dependency(item.trim().split(/\s+/)[0], path);
      if (tagName === "link" && /(?:stylesheet|icon|preload|modulepreload|manifest|preconnect|dns-prefetch)/.test(attributes.rel || "")) dependency(attributes.href, path);
      if (tagName === "a" && /^https?:/.test(attributes.href || "")) {
        const host = new URL(attributes.href).hostname;
        outgoing[host] = (outgoing[host] || 0) + 1;
      }
      if (tagName === "a" && attributes.href?.startsWith("/")) localLinks.add(new URL(attributes.href, origin).pathname);
      if (attributes.style) for (const match of attributes.style.matchAll(/url\(["']?([^"')]+)["']?\)/g)) dependency(match[1], path);
      return { tagName, attribs: attributes };
    } } });
  } else if (path.endsWith(".css")) {
    for (const match of (await readFile(path, "utf8")).matchAll(/url\(["']?([^"')]+)["']?\)/g)) dependency(match[1], path);
  }
}
const iconTiles = JSON.parse(await readFile(resolve(root, "memory-icons/manifest.json"), "utf8"));
for (const tile of Object.values(iconTiles.icons)) localFiles.add(tile.sheet);
for (const path of localLinks) {
  // This report is written after the audit has finished checking other links.
  if (path === "/dependency-audit.json") continue;
  const target = resolve(root, "." + decodeURIComponent(path));
  try {
    const info = await stat(target);
    if (info.isDirectory()) await stat(resolve(target, "index.html"));
  } catch { failures.push({ url: path, error: "Missing local navigation or download target" }); }
}
for (const file of localFiles) {
  const path = resolve(root, "." + file);
  if (!path.startsWith(root + (process.platform === "win32" ? "\\" : "/"))) { failures.push({ url: file, error: "Local dependency escapes the site" }); continue; }
  try { if (!(await stat(path)).isFile()) throw new Error("Not a file"); }
  catch { failures.push({ url: file, error: "Missing local runtime file" }); }
}
const report = { html_pages: htmlPages, total_bytes: totalBytes, external_runtime_dependencies: failures.filter((row) => row.error === "External runtime dependency").length, verified_local_runtime_files: localFiles.size, external_navigation_links_by_host: outgoing, failures };
await writeFile(resolve(root, "dependency-audit.json"), JSON.stringify(report, null, 2) + "\n");
if (failures.length) throw new Error(`Dependency audit failed: ${JSON.stringify(failures.slice(0, 10))}`);
if (totalBytes >= 950 * 1024 * 1024) throw new Error("Static site exceeds its 950 MiB preservation budget");
console.log(`Dependency audit passed: ${htmlPages} HTML pages, ${localFiles.size} local runtime files, zero external runtime dependencies, ${(totalBytes / 1024 / 1024).toFixed(1)} MiB.`);

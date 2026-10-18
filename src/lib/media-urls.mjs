export function imageUrl(value, release) {
  try {
    if (!value || value.startsWith("#")) return null;
    const url = new URL(value, `https://github.com/${release.repo_name}/blob/${release.build_commit}/`);
    if (!["https:", "http:"].includes(url.protocol)) return null;
    if (url.hostname === "github.com" && /\/(blob|raw)\//.test(url.pathname)) {
      url.hostname = "raw.githubusercontent.com";
      url.pathname = url.pathname.replace(/\/(blob|raw)\//, "/");
    }
    url.hash = "";
    return url.href;
  } catch { return null; }
}

export function canonicalImage(attributes) {
  if (attributes["data-canonical-src"]) return attributes["data-canonical-src"];
  try {
    const url = new URL(attributes.src);
    if (url.hostname === "camo.githubusercontent.com") {
      const hex = url.pathname.split("/").at(-1);
      if (/^(?:[a-f0-9]{2})+$/i.test(hex)) return Buffer.from(hex, "hex").toString("utf8");
    }
  } catch { /* Not a camo URL. */ }
  return attributes.src;
}

export function frozenImageUrl(value, release) {
  const normalized = imageUrl(value, release);
  if (!normalized) return null;
  const url = new URL(normalized);
  const parts = url.pathname.slice(1).split("/");
  // A README's own repository assets belong to its captured build revision.
  if (url.hostname === "raw.githubusercontent.com" && parts.slice(0, 2).join("/").toLowerCase() === release.repo_name.toLowerCase() && parts.length >= 4) {
    parts[2] = release.build_commit;
    url.pathname = "/" + parts.join("/");
  }
  return url.href;
}

import sanitizeHtml from "sanitize-html";
import sharp from "sharp";
import { createHash } from "node:crypto";
const svgTags = ["svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "text", "tspan", "defs", "linearGradient", "radialGradient", "stop", "clipPath", "mask", "use", "title", "desc"];

export function inertSvg(source) {
  return sanitizeHtml(source, {
    parser: { xmlMode: true, lowerCaseTags: false, lowerCaseAttributeNames: false },
    allowedTags: svgTags,
    allowedAttributes: { "*": ["xmlns", "xmlns:xlink", "width", "height", "viewBox", "preserveAspectRatio", "id", "d", "x", "y", "x1", "x2", "y1", "y2", "cx", "cy", "r", "rx", "ry", "points", "fill", "fill-rule", "fill-opacity", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-opacity", "opacity", "transform", "font-family", "font-size", "font-weight", "text-anchor", "textLength", "lengthAdjust", "dominant-baseline", "dx", "dy", "offset", "stop-color", "stop-opacity", "gradientUnits", "gradientTransform", "clip-path", "mask", "href", "xlink:href"] },
    transformTags: { "*": (tagName, attributes) => ({ tagName, attribs: Object.fromEntries(Object.entries(attributes).filter(([name, value]) => {
      if (name === "xmlns") return value === "http://www.w3.org/2000/svg";
      if (name === "xmlns:xlink") return value === "http://www.w3.org/1999/xlink";
      if (["href", "xlink:href"].includes(name)) return value.startsWith("#");
      return !/url\(\s*["']?(?!#)/i.test(value) && !/^(?:file|https?|data):/i.test(value);
    })) }) },
  });
}

async function rasterSvg(source) {
  const images = [];
  const prefix = createHash("sha256").update(source).digest("hex").slice(0, 24);
  const placeholders = sanitizeHtml(source, {
    parser: { xmlMode: true, lowerCaseTags: false, lowerCaseAttributeNames: false },
    allowedTags: [...svgTags, "image"], allowedAttributes: false,
    transformTags: { image: (_, attributes) => {
      const id = `archive-image-${prefix}-${images.length}`;
      images.push({ id, attributes });
      return { tagName: "g", attribs: { id } };
    } },
  });
  let safe = inertSvg(placeholders);
  let pixels = 0;
  for (const { id, attributes } of images.slice(0, 64)) {
    const match = /^(?:data:image\/(png|jpeg|gif|webp);base64,)([A-Za-z0-9+/=\s]+)$/.exec(attributes.href || attributes["xlink:href"] || "");
    if (!match || match[2].length > 2 * 1024 * 1024) continue;
    try {
      const input = Buffer.from(match[2], "base64");
      const metadata = await sharp(input, { limitInputPixels: 40000000 }).metadata();
      if (!["png", "jpeg", "gif", "webp"].includes(metadata.format)) continue;
      pixels += metadata.width * metadata.height;
      if (pixels > 40000000) break;
      const geometry = {};
      for (const name of ["x", "y", "width", "height"]) {
        const value = attributes[name] ?? (["x", "y"].includes(name) ? "0" : metadata[name]);
        if (!/^-?\d+(?:\.\d+)?$/.test(String(value)) || Math.abs(Number(value)) > 4096) throw new Error("Unsupported inline image geometry");
        geometry[name] = Number(value);
      }
      // Decode a static PNG first. SVG/file/network data URIs never reach the
      // SVG renderer. Animated inline GIFs retain their original SVG bytes.
      const png = await sharp(input, { limitInputPixels: 40000000 }).png().toBuffer();
      const image = `<image x="${geometry.x}" y="${geometry.y}" width="${geometry.width}" height="${geometry.height}" href="data:image/png;base64,${png.toString("base64")}"/>`;
      safe = safe.replace(`<g id="${id}"></g>`, image);
    } catch { /* Unsupported embedded data remains an empty inert group. */ }
  }
  return safe;
}

export async function displayImage(data) {
  const svg = /<svg[\s>]/i.test(data.subarray(0, 65536).toString("utf8"));
  const input = svg ? Buffer.from(await rasterSvg(data.toString("utf8"))) : data;
  const metadata = await sharp(input, { limitInputPixels: 40000000 }).metadata();
  if (!["png", "jpeg", "gif", "webp", "avif", "svg"].includes(metadata.format)) throw new Error("Unsupported image format");
  if (metadata.format === "svg") {
    const bytes = await sharp(input, { limitInputPixels: 40000000 }).resize({ width: Math.min(metadata.width || 1000, 2048), height: 4096, fit: "inside", withoutEnlargement: true }).png().toBuffer();
    return { bytes, extension: "png", originalExtension: "svg.txt", width: metadata.width, height: metadata.height, transformed: true };
  }
  return { bytes: data, extension: metadata.format === "jpeg" ? "jpg" : metadata.format, width: metadata.width, height: metadata.height, transformed: false };
}

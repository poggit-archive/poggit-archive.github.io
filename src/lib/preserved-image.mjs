import sanitizeHtml from "sanitize-html";
import sharp from "sharp";

export function inertSvg(source) {
  return sanitizeHtml(source, {
    parser: { xmlMode: true, lowerCaseTags: false, lowerCaseAttributeNames: false },
    allowedTags: ["svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "text", "tspan", "defs", "linearGradient", "radialGradient", "stop", "clipPath", "mask", "use", "title", "desc"],
    allowedAttributes: { "*": ["xmlns", "xmlns:xlink", "width", "height", "viewBox", "preserveAspectRatio", "id", "d", "x", "y", "x1", "x2", "y1", "y2", "cx", "cy", "r", "rx", "ry", "points", "fill", "fill-rule", "fill-opacity", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-opacity", "opacity", "transform", "font-family", "font-size", "font-weight", "text-anchor", "textLength", "lengthAdjust", "dominant-baseline", "dx", "dy", "offset", "stop-color", "stop-opacity", "gradientUnits", "gradientTransform", "clip-path", "mask", "href", "xlink:href"] },
    transformTags: { "*": (tagName, attributes) => ({ tagName, attribs: Object.fromEntries(Object.entries(attributes).filter(([name, value]) => {
      if (name === "xmlns") return value === "http://www.w3.org/2000/svg";
      if (name === "xmlns:xlink") return value === "http://www.w3.org/1999/xlink";
      if (["href", "xlink:href"].includes(name)) return value.startsWith("#");
      return !/url\(\s*["']?(?!#)/i.test(value) && !/^(?:file|https?|data):/i.test(value);
    })) }) },
  });
}

export async function displayImage(data) {
  const svg = /<svg[\s>]/i.test(data.subarray(0, 65536).toString("utf8"));
  const input = svg ? Buffer.from(inertSvg(data.toString("utf8"))) : data;
  const metadata = await sharp(input, { limitInputPixels: 40000000 }).metadata();
  if (!["png", "jpeg", "gif", "webp", "avif", "svg"].includes(metadata.format)) throw new Error("Unsupported image format");
  if (metadata.format === "svg") {
    const bytes = await sharp(input, { limitInputPixels: 40000000 }).resize({ width: Math.min(metadata.width || 1000, 2048), height: 4096, fit: "inside", withoutEnlargement: true }).png().toBuffer();
    return { bytes, extension: "png", originalExtension: "svg.txt", width: metadata.width, height: metadata.height, transformed: true };
  }
  return { bytes: data, extension: metadata.format === "jpeg" ? "jpg" : metadata.format, width: metadata.width, height: metadata.height, transformed: false };
}

// Build explicit local previews while retaining the unmodified GIF originals.
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

sharp.cache({ memory: 32, items: 20, files: 10 });
sharp.concurrency(1);
const directory = resolve("archive/media-chrome");
const captures = JSON.parse(await readFile(resolve(directory, "downloads.json"), "utf8"));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const results = [];
for (const capture of captures.filter((row) => row.result === "downloaded" && row.url.endsWith(".gif"))) {
  const original = resolve(directory, capture.file);
  if (hash(await readFile(original)) !== capture.sha256) throw new Error("Original GIF checksum mismatch");
  const source = await sharp(original).metadata();
  const width = capture.bytes > 24 * 1024 * 1024 ? 720 : null;
  const filename = capture.sha256 + (width ? "-preview.webp" : ".webp");
  const output = resolve(directory, filename);
  try { await access(output); }
  catch {
    let pipeline = sharp(original, { animated: true, limitInputPixels: 450000000 });
    if (width) pipeline = pipeline.resize({ width, withoutEnlargement: true, kernel: "nearest" });
    await pipeline.webp({ lossless: true, effort: width ? 1 : 4, minSize: !width, loop: source.loop, delay: source.delay }).toFile(output);
  }
  const display = await sharp(output).metadata();
  if (source.pages !== display.pages || source.loop !== display.loop || JSON.stringify(source.delay) !== JSON.stringify(display.delay)) throw new Error("Animation timeline changed");
  const samples = [];
  const frames = [0, Math.floor(source.pages / 2), source.pages - 1];
  const resizedHashes = new Map();
  const canonicalHash = (bytes) => {
    for (let i = 0; i < bytes.length; i += 4) if (!bytes[i + 3]) bytes[i] = bytes[i + 1] = bytes[i + 2] = 0;
    return hash(bytes);
  };
  if (width) {
    // Sharp applies animated resizing to the complete page sequence. Compare
    // against that sequence, rather than separately resampling single pages.
    let expected = await sharp(original, { animated: true, limitInputPixels: 450000000 }).resize({ width, kernel: "nearest" }).ensureAlpha().raw().toBuffer();
    const stride = display.width * display.height * 4;
    if (expected.length !== stride * display.pages) throw new Error("Unexpected resized page sequence");
    for (const page of frames) resizedHashes.set(page, canonicalHash(Buffer.from(expected.subarray(page * stride, (page + 1) * stride))));
    expected = null;
  }
  for (const page of frames) {
    const hashes = [];
    for (const file of [original, output]) {
      if (file === original && width) { hashes.push(resizedHashes.get(page)); continue; }
      let pipeline = sharp(file, { page, pages: 1, limitInputPixels: 40000000 });
      const bytes = await pipeline.ensureAlpha().raw().toBuffer();
      // Fully transparent RGB values do not affect display and can be
      // canonicalized differently by the GIF and WebP decoders.
      hashes.push(canonicalHash(bytes));
    }
    if (hashes[0] !== hashes[1]) throw new Error(`Decoded frame ${page} differs from the intended preview`);
    samples.push({ frame: page, canonical_rgba_sha256: hashes[0] });
  }
  const bytes = await readFile(output);
  results.push({ original_sha256: capture.sha256, file: filename, sha256: hash(bytes), bytes: bytes.length, transformation: { kind: "lossless_animated_webp", encoder: "sharp 0.35.5", lossless: true, width: display.width, height: display.height, pages: display.pages, delay: display.delay, loop: display.loop, ...(width ? { resize: { width, kernel: "nearest", source_width: source.width, source_height: source.height } } : {}), verification: { frame_count_equal: true, all_frame_delays_equal: true, loop_equal: true, pixel_samples: samples } } });
  console.log(`${capture.url}: ${bytes.length} bytes, ${display.pages} frames, timeline and three pixel samples verified`);
}
await writeFile(resolve(directory, "animated-derivatives.json"), JSON.stringify(results, null, 2) + "\n");

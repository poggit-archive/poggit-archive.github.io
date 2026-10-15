import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const outputDirectory = resolve(projectRoot, process.argv[2] || "dist");
if (!outputDirectory.startsWith(`${projectRoot}${sep}`)) {
  throw new Error(`Refusing to write outside the project: ${outputDirectory}`);
}
const tileCacheDirectory = resolve(projectRoot, ".memory-icon-cache");
const dataDirectory = resolve(outputDirectory, "data");
const apiDirectory = resolve(dataDirectory, "api", "v1");
const outputIconsDirectory = resolve(outputDirectory, "memory-icons");
const iconSize = 96;
const columns = 8;
const rows = 8;
const tilesPerSheet = columns * rows;
const workerCount = 4;
const retries = 4;
const userAgent = "PoggitArchiveMemoryIconMirror/1.0 (+https://poggit-archive.github.io/)";

function fail(message) {
  throw new Error(message);
}

function safeResolve(base, relativePath) {
  const path = resolve(base, relativePath);
  if (!path.startsWith(`${base}${sep}`) && path !== base) {
    fail(`Refusing to read outside ${base}: ${path}`);
  }
  return path;
}

function normalizeIconUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    if (url.protocol !== "https:" || !["github.com", "raw.githubusercontent.com"].includes(url.hostname)) {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}

function submissionTime(release) {
  const value = Number(release.submission_date);
  return Number.isFinite(new Date(value * 1000).getTime()) ? value : Number.MAX_SAFE_INTEGER;
}

function wait(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

function retryDelay(response, attempt) {
  const retryAfterHeader = response?.headers.get("retry-after");
  const retryAfter = Number(retryAfterHeader);
  return retryAfterHeader !== null && Number.isFinite(retryAfter) && retryAfter >= 0
    ? retryAfter * 1000
    : Math.min(1_000 * 2 ** (attempt - 1), 15_000);
}

async function readReleases() {
  const pointerPath = safeResolve(apiDirectory, "current.json");
  const pointer = JSON.parse(await readFile(pointerPath, "utf8"));
  if (typeof pointer.files?.releases !== "string") fail("Snapshot index does not point to release data.");

  const releasesPath = resolve(apiDirectory, pointer.files.releases);
  if (!releasesPath.startsWith(`${dataDirectory}${sep}`)) {
    fail(`Refusing to read release data outside ${dataDirectory}: ${releasesPath}`);
  }
  const releases = JSON.parse(await readFile(releasesPath, "utf8"));
  if (!Array.isArray(releases)) fail("Release snapshot is not an array.");
  return { snapshotId: String(pointer.snapshot_id || "unknown"), releases };
}

async function downloadTile(source) {
  const cacheName = `${createHash("sha256").update(source).digest("hex")}.png`;
  const cachePath = resolve(tileCacheDirectory, cacheName);
  const missingPath = `${cachePath}.missing`;
  try {
    const missing = JSON.parse(await readFile(missingPath, "utf8"));
    return { error: `${source}: cached HTTP ${missing.status}`, fromCache: true };
  } catch (error) {
    if (error.code !== "ENOENT") await rm(missingPath, { force: true });
  }

  try {
    const cachedTile = await readFile(cachePath);
    const metadata = await sharp(cachedTile).metadata();
    if (metadata.width === iconSize && metadata.height === iconSize && metadata.format === "png") {
      return {
        tile: cachedTile,
        hash: createHash("sha256").update(cachedTile).digest("hex"),
        fromCache: true,
      };
    }
    await rm(cachePath, { force: true });
  } catch (error) {
    if (error.code !== "ENOENT") await rm(cachePath, { force: true });
  }

  let lastError = "Unknown image error";
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    let response;
    try {
      response = await fetch(source, {
        headers: { Accept: "image/avif,image/webp,image/png,image/*;q=0.9,*/*;q=0.1", "User-Agent": userAgent },
        redirect: "follow",
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        lastError = `HTTP ${response.status}`;
        const retryable = response.status === 408 || response.status === 425 || response.status === 429
          || response.status >= 500 || (response.status === 403 && response.headers.has("retry-after"));
        const delay = retryDelay(response, attempt);
        await response.body?.cancel();
        if (response.status === 404 || response.status === 410) {
          await writeFile(missingPath, `${JSON.stringify({ status: response.status })}\n`);
        }
        if (!retryable || attempt === retries || delay > 60_000) break;
        await wait(delay);
        continue;
      }

      const image = Buffer.from(await response.arrayBuffer());
      const tile = await sharp(image, { limitInputPixels: 40_000_000 })
        .resize(iconSize, iconSize, {
          fit: "contain",
          background: { r: 255, g: 255, b: 255, alpha: 0 },
        })
        .png()
        .toBuffer();
      const hash = createHash("sha256").update(tile).digest("hex");
      await rm(missingPath, { force: true });
      await writeFile(cachePath, tile);
      return { tile, hash, fromCache: false };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt === retries) break;
      await wait(Math.min(1_000 * 2 ** (attempt - 1), 15_000));
    }
  }
  return { error: `${source}: ${lastError}` };
}

async function main() {
  const { snapshotId, releases } = await readReleases();
  const oldestFirst = releases
    .map((release) => ({ release, source: normalizeIconUrl(release.icon_url), date: submissionTime(release) }))
    .filter(({ source }) => source)
    .sort((a, b) => a.date - b.date || Number(a.release.id || 0) - Number(b.release.id || 0));

  const urlOrder = [];
  const seenUrls = new Set();
  for (const { source } of oldestFirst) {
    if (seenUrls.has(source)) continue;
    seenUrls.add(source);
    urlOrder.push(source);
  }

  const limitArgument = process.argv.find((argument) => argument.startsWith("--limit="));
  const requestedLimit = limitArgument ? Number(limitArgument.slice("--limit=".length)) : 0;
  const limit = Number.isSafeInteger(requestedLimit) && requestedLimit > 0 ? requestedLimit : urlOrder.length;
  const isPartial = limit < urlOrder.length;
  const sources = urlOrder.slice(0, limit);
  await mkdir(tileCacheDirectory, { recursive: true });
  await rm(outputIconsDirectory, { recursive: true, force: true });
  await mkdir(outputIconsDirectory, { recursive: true });

  const sourceToTile = new Map();
  const hashToTile = new Map();
  const sheetUrls = new Map();
  const failures = [];
  let nextSheetTiles = [];
  let tileCount = 0;
  let completed = 0;
  let cacheHits = 0;
  const downloadedSources = new Array(sources.length);

  async function writeSheet(tiles, sheetIndex) {
    if (tiles.length === 0) return;
    const composites = tiles.map(({ tile, column, row }) => ({
      input: tile,
      left: column * iconSize,
      top: row * iconSize,
    }));
    const sheetImage = await sharp({
      create: {
        width: columns * iconSize,
        height: rows * iconSize,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 0 },
      },
    })
      .composite(composites)
      .webp({ quality: 88, effort: 4 })
      .toBuffer();
    const sheetHash = createHash("sha256").update(sheetImage).digest("hex").slice(0, 16);
    const filename = `memory-${String(sheetIndex).padStart(3, "0")}-${sheetHash}.webp`;
    await writeFile(resolve(outputIconsDirectory, filename), sheetImage);
    sheetUrls.set(sheetIndex, `/memory-icons/${filename}`);
  }

  let cursor = 0;
  async function worker() {
    while (cursor < sources.length) {
      const index = cursor++;
      downloadedSources[index] = await downloadTile(sources[index]);
      if (downloadedSources[index].fromCache) cacheHits += 1;
      completed += 1;
      if (completed % 250 === 0 || completed === sources.length) {
        console.log(`Prepared ${completed}/${sources.length} icon sources`);
      }
    }
  }
  await Promise.all(Array.from({ length: workerCount }, worker));

  for (let index = 0; index < sources.length; index += 1) {
    const source = sources[index];
    const downloaded = downloadedSources[index];
    if (downloaded.error) {
      failures.push(downloaded.error);
      continue;
    }

    let tile = hashToTile.get(downloaded.hash);
    if (!tile) {
      const globalIndex = tileCount++;
      const sheetIndex = Math.floor(globalIndex / tilesPerSheet);
      const inSheetIndex = globalIndex % tilesPerSheet;
      tile = {
        sheetIndex,
        column: inSheetIndex % columns,
        row: Math.floor(inSheetIndex / columns),
      };
      hashToTile.set(downloaded.hash, tile);
      nextSheetTiles.push({ tile: downloaded.tile, column: tile.column, row: tile.row });

      if (nextSheetTiles.length === tilesPerSheet) {
        const readyTiles = nextSheetTiles;
        nextSheetTiles = [];
        await writeSheet(readyTiles, sheetIndex);
      }
    }
    sourceToTile.set(source, tile);
  }
  await writeSheet(nextSheetTiles, Math.floor((tileCount - 1) / tilesPerSheet));

  const icons = {};
  for (const { release, source } of oldestFirst) {
    const tile = sourceToTile.get(source);
    if (tile && release.id !== undefined && release.id !== null) {
      icons[String(release.id)] = {
        sheet: sheetUrls.get(tile.sheetIndex),
        column: tile.column,
        row: tile.row,
      };
    }
  }

  const manifest = {
    schema_version: 1,
    snapshot_id: snapshotId,
    unique_icons: tileCount,
    unavailable_sources: failures.length,
    partial: isPartial,
    icons,
  };
  await writeFile(resolve(outputIconsDirectory, "manifest.json"), `${JSON.stringify(manifest)}\n`);

  console.log(`Memory icon mirror complete: ${tileCount} unique icon tiles, ${cacheHits} cached sources, ${sources.length - sourceToTile.size} unavailable sources.`);
  if (isPartial) console.log(`Partial local preview: mirrored the first ${sources.length} unique icon sources.`);
  if (failures.length > 0) {
    for (const failure of failures.slice(0, 8)) console.warn(`Unavailable icon: ${failure}`);
    if (failures.length > 8) console.warn(`And ${failures.length - 8} more unavailable icon sources.`);
  }
}

await main();

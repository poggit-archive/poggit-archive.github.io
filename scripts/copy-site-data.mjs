import { access, cp, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const destinations = new Set([
  resolve(root, "dist", "data"),
  resolve(root, "public", "data"),
]);

export async function copySiteData(target) {
  const destination = resolve(root, target);
  if (!destinations.has(destination)) {
    throw new Error("Site data can only be copied to dist/data or public/data.");
  }

  await mkdir(destination, { recursive: true });
  await cp(resolve(root, "data", "pm-pl-repositories.json"), resolve(destination, "pm-pl-repositories.json"), {
    force: true,
  });
  for (const directory of ["api", "snapshots"]) {
    await cp(resolve(root, "data", directory), resolve(destination, directory), {
      recursive: true,
      force: true,
    });
  }

  // Publish stable, short API URLs alongside the immutable timestamped snapshots.
  const apiDirectory = resolve(destination, "api", "v1");
  const currentPath = resolve(apiDirectory, "current.json");
  const current = JSON.parse(await readFile(currentPath, "utf8"));
  const snapshotDirectory = resolve(root, "data", "snapshots", current.snapshot_id);
  for (const [key, reference] of Object.entries(current.files || {})) {
    if (typeof reference !== "string" || reference.length === 0) {
      throw new Error(`Invalid API file reference for ${key}.`);
    }
    const filename = basename(reference);
    if (filename !== reference && !reference.endsWith(`/${filename}`) && !reference.endsWith(`\\${filename}`)) {
      throw new Error(`Invalid API file name for ${key}.`);
    }
    const aliasPath = resolve(apiDirectory, filename);
    if (!aliasPath.startsWith(apiDirectory + "/") && !aliasPath.startsWith(apiDirectory + "\\")) {
      throw new Error(`API alias escapes the version directory for ${key}.`);
    }

    let sourcePath = resolve(snapshotDirectory, filename);
    try {
      await access(sourcePath);
    } catch (error) {
      // Raw HTML is intentionally exposed as inert text in the static site.
      if (!filename.endsWith(".html.txt")) throw error;
      sourcePath = resolve(snapshotDirectory, filename.slice(0, -4));
    }
    await cp(sourcePath, aliasPath, { force: true });
    // The immutable copy remains in the repository. In the deployed static site,
    // keep one copy under the stable API URL to stay within the Pages size budget.
    const snapshotFilename = filename.endsWith(".html.txt") ? filename.slice(0, -4) : filename;
    await rm(resolve(destination, "snapshots", current.snapshot_id, snapshotFilename), { force: true });
    current.files[key] = filename;
  }
  await writeFile(currentPath, `${JSON.stringify(current, null, 2)}\n`);

  async function makeRawHtmlInert(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (!path.startsWith(destination + "/") && !path.startsWith(destination + "\\")) throw new Error("Raw HTML path escapes the exported data directory");
      if (entry.isDirectory()) await makeRawHtmlInert(path);
      else if (entry.name.endsWith(".html")) await rename(path, path + ".txt");
    }
  }
  await makeRawHtmlInert(resolve(destination, "snapshots"));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await copySiteData(process.argv[2] || "dist/data");
}

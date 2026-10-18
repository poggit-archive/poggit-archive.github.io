import { cp, mkdir, readdir, rename } from "node:fs/promises";
import { resolve } from "node:path";
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

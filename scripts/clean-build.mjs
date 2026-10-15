import { realpath, rm } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = await realpath(resolve(fileURLToPath(new URL("..", import.meta.url))));
for (const relativePath of ["dist", ".astro", ".npm-cache", "node_modules"]) {
  const target = resolve(root, relativePath);
  if (!target.startsWith(`${root}${sep}`)) {
    throw new Error(`Refusing to clean a path outside the project: ${target}`);
  }

  try {
    const actualTarget = await realpath(target);
    if (!actualTarget.startsWith(`${root}${sep}`)) {
      throw new Error(`Refusing to clean a path outside the project: ${actualTarget}`);
    }
    await rm(actualTarget, { recursive: true, force: true });
    console.log(`Removed ${relativePath}`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

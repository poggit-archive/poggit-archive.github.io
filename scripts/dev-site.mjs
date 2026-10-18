import { spawn, spawnSync } from "node:child_process";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { copySiteData } from "./copy-site-data.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const publicData = resolve(root, "public", "data");
const publicIcons = resolve(root, "public", "memory-icons");
await copySiteData("public/data");
const prepare = spawnSync(process.execPath, [resolve(root, "scripts", "prepare-preserved-site.mjs")], { cwd: root, stdio: "inherit" });
if (prepare.error || prepare.status !== 0) throw prepare.error || new Error("Could not verify preserved media and documents.");

const npmCli = process.env.npm_execpath;
if (!npmCli) {
  await Promise.all([
    rm(publicData, { recursive: true, force: true }),
    rm(publicIcons, { recursive: true, force: true }),
  ]);
  throw new Error("Run the development server with npm run dev.");
}

const mirror = spawnSync(process.execPath, [resolve(root, "scripts", "mirror-memory-icons.mjs"), "public", "--limit=64"], {
  cwd: root,
  stdio: "inherit",
});
if (mirror.error || mirror.status !== 0) {
  await Promise.all([
    rm(publicData, { recursive: true, force: true }),
    rm(publicIcons, { recursive: true, force: true }),
  ]);
  throw mirror.error || new Error("Could not prepare the local Memory page preview.");
}

const server = spawn(process.execPath, [npmCli, "exec", "--", "astro", "dev"], {
  cwd: root,
  stdio: "inherit",
});
let cleanupPromise;
const cleanup = () => {
  cleanupPromise ??= rm(publicData, { recursive: true, force: true });
  cleanupPromise = Promise.all([
    cleanupPromise,
    rm(publicIcons, { recursive: true, force: true }),
  ]);
  return cleanupPromise;
};

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.kill(signal));
}

server.on("error", async (error) => {
  console.error(error);
  await cleanup();
  process.exitCode = 1;
});
server.on("exit", async (code) => {
  await cleanup();
  process.exitCode = code ?? 1;
});

import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { copySiteData } from "./copy-site-data.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const publicData = resolve(root, "public", "data");
await copySiteData("public/data");

const npmCli = process.env.npm_execpath;
if (!npmCli) {
  await rm(publicData, { recursive: true, force: true });
  throw new Error("Run the development server with npm run dev.");
}

const server = spawn(process.execPath, [npmCli, "exec", "--", "astro", "dev"], {
  cwd: root,
  stdio: "inherit",
});
let cleanupPromise;
const cleanup = () => {
  cleanupPromise ??= rm(publicData, { recursive: true, force: true });
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

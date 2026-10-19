import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { copySiteData } from "../scripts/copy-site-data.mjs";

test("build publishes stable API aliases for the current snapshot", async () => {
  const pointer = JSON.parse(await readFile("data/api/v1/current.json", "utf8"));
  const snapshotDirectory = resolve("data/snapshots", pointer.snapshot_id);

  await copySiteData("dist/data");

  const builtPointer = JSON.parse(await readFile("dist/data/api/v1/current.json", "utf8"));
  assert.deepEqual(builtPointer.files, pointer.files);

  for (const [key, filename] of Object.entries(pointer.files)) {
    assert.equal(typeof filename, "string", `${key} should have a stable file name`);
    assert.equal(filename, filename.split(/[\\/]/).at(-1), `${key} should not expose a snapshot path`);

    const originalName = filename.endsWith(".html.txt") ? filename.slice(0, -4) : filename;
    const original = await readFile(resolve(snapshotDirectory, originalName));
    const alias = await readFile(resolve("dist/data/api/v1", filename));
    assert.deepEqual(alias, original, `${filename} should serve the current snapshot content`);
    await assert.rejects(access(resolve("dist/data/snapshots", pointer.snapshot_id, originalName)), `${filename} should not be duplicated in the deployed snapshot`);
  }
});

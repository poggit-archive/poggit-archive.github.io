import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import test from "node:test";
import sanitizeHtml from "sanitize-html";
import { getVirionCatalog, virionPath, virionView } from "../src/lib/virion-details.mjs";

// Generate the ignored document fixture from committed captures on fresh checkouts.
execFileSync(process.execPath, [fileURLToPath(new URL("../scripts/prepare-virion-details.mjs", import.meta.url))], { cwd: fileURLToPath(new URL("../", import.meta.url)), stdio: "pipe" });
const catalog = getVirionCatalog();
const hash = (data) => createHash("sha256").update(data).digest("hex");
test("All 265 virions have unique static routes matching catalog navigation", () => {
  const node = { addEventListener() {}, querySelectorAll() { return []; } };
  const document = { querySelector() { return node; }, querySelectorAll() { return []; }, addEventListener() {} };
  const script = readFileSync(new URL("../public/app.js", import.meta.url), "utf8").replace("  init();", "  globalThis.route = virionDetailPath;");
  const context = vm.createContext({ document, URL });
  vm.runInContext(script, context);
  const routes = new Set();
  for (const item of catalog.items) {
    const path = virionPath(item);
    assert.match(path, /^\/virions\/[a-z0-9_.-]+\/[a-z0-9_.-]+\/[a-z0-9_.-]+\/$/);
    assert.equal(context.route(item), path);
    routes.add(path);
  }
  assert.equal(routes.size, 265);
});

test("Virion detail downloads retain original, rebuilt and PHAR-derived identities", () => {
  const counts = {};
  for (const item of catalog.items) {
    const view = virionView(item, catalog);
    for (const asset of [view.artifact, view.source]) {
      const label = asset?.label || "missing";
      counts[label] = (counts[label] || 0) + 1;
      if (asset) assert.match(asset.url, /^\/archive-files\/[a-f0-9]{64}\.(zip|phar)$/);
    }
    if (view.artifact) assert.equal(view.record.phar_sha256, view.artifact.sha256);
    else assert.equal(view.pharVersion, null);
    if (view.source) assert.equal(view.record.source_zip_sha256, view.source.sha256);
    if (item.version && view.record.manifest.version != null) assert.equal(view.version, item.version);
  }
  assert.deepEqual(counts, { "Rebuilt PHAR": 46, "Rebuild source": 44, "Archived PHAR": 213, "Archived source": 214, "Source from PHAR": 1, missing: 12 });
  const form = catalog.items.find((item) => item.id === "jojoe77777/formapi/libformapi@latest");
  assert.equal(form.version, null);
  assert.equal(virionView(form, catalog).version, "2.1.1");
});

test("Catalog and detail versions agree without rewriting missing upstream versions", () => {
  const index = JSON.parse(readFileSync(new URL("../public/virion-documents/index.json", import.meta.url), "utf8"));
  assert.equal(index.snapshot_id, catalog.capture.snapshot_id);
  assert.equal(Object.keys(index.versions).length, 265);
  const node = { addEventListener() {}, querySelectorAll() { return []; } };
  const document = { querySelector() { return node; }, querySelectorAll() { return []; }, addEventListener() {} };
  const script = readFileSync(new URL("../public/app.js", import.meta.url), "utf8").replace("  init();", "  globalThis.versionsTest = { state, virionVersionInfo };");
  const context = vm.createContext({ document, URL });
  vm.runInContext(script, context);
  const client = context.versionsTest;
  client.state.virionVersions = index.versions;
  for (const item of catalog.items) {
    const view = virionView(item, catalog), info = client.virionVersionInfo(item);
    assert.equal(info.version, view.versionSource ? view.version : null);
    assert.equal(info.source, view.versionSource);
  }
  assert.equal(catalog.items.filter((item) => !item.version && index.versions[item.id].version).length, 26);
  const form = catalog.items.find((item) => item.id === "jojoe77777/formapi/libformapi@latest");
  assert.equal(form.version, null);
  assert.deepEqual(index.versions[form.id], { version: "2.1.1", source: "Rebuilt PHAR manifest" });
  assert.deepEqual(index.versions["tobias-2006/commandarguments/commandarguments@latest"], { version: null, source: null });
  client.state.virionVersions = {};
  assert.equal(client.virionVersionInfo(form).version, null);
  const known = catalog.items.find((item) => item.version);
  assert.equal(client.virionVersionInfo(known).version, known.version);
});

test("Virion documents retain source hashes and do not relabel empty license files", () => {
  for (const item of catalog.items) {
    const view = virionView(item, catalog);
    for (const document of [...Object.values(view.record.documents), ...view.record.licenses]) assert.equal(hash(document.content), document.text_sha256);
    if (!view.record.licenses.length) assert.equal(view.license, "No License");
    const users = view.users;
    assert.equal(new Set(users.map((user) => user.path)).size, users.length);
    for (const user of users) assert.ok([...catalog.pluginCatalog.projects.values()].some((project) => project.path === user.path));
  }
});

test("Compressed virion documents contain inert HTML and only local display media", () => {
  const payload = JSON.parse(gunzipSync(readFileSync(new URL(`../public${catalog.documentUrl}`, import.meta.url))));
  assert.equal(Object.keys(payload.records).length, 265);
  let images = 0;
  for (const document of Object.values(payload.documents)) {
    if (!document.html) continue;
    sanitizeHtml(document.html, { allowedTags: [], transformTags: { "*": (tagName, attributes) => {
      assert.ok(!["script", "style", "iframe", "object", "embed", "svg", "form"].includes(tagName));
      assert.ok(!Object.keys(attributes).some((key) => /^on|^style$/.test(key)));
      if (tagName === "img") { images++; assert.match(attributes.src, /^\/(archive-media|virion-media|assets)\//); }
      return { tagName, attribs: attributes };
    } } });
  }
  assert.ok(images > 0);
});

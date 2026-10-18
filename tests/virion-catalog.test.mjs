import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const base = new URL("../data/snapshots/2026-10-14T20-07-25Z/", import.meta.url);
const read = name => JSON.parse(readFileSync(new URL(name, base), "utf8"));
const catalog = read("virions.json");
const downloads = read("downloads-virions.json");
const sources = read("virion-source-downloads.json");
const newBuilds = read("rebuilt-virions.json");
const asset = /^https:\/\/github\.com\/poggit-archive\/artifacts\/releases\/download\//;

test("All 259 archived source ZIPs have verified remote identity and a corresponding PHAR", () => {
  assert.equal(Object.keys(sources).length, 259);
  assert.equal(catalog.length, 265);
  for (const [id, source] of Object.entries(sources)) {
    assert.equal(source.status, "uploaded", id);
    assert.match(source.remote_url, asset, id);
    assert.equal(source.remote_sha256, source.sha256, id);
    assert.match(source.sha256, /^[a-f0-9]{64}$/, id);
    assert.ok(source.bytes > 0 && source.remote_asset_id > 0, id);
    if (source.complete_git_snapshot) {
      assert.equal(source.method, "git_archive", id);
      assert.equal(source.verified_revision, source.source_commit, id);
      assert.match(source.source_commit, /^[a-f0-9]{40}$/, id);
    } else {
      assert.equal(source.method, "unphar", id);
      assert.match(source.original_phar_sha256, /^[a-f0-9]{64}$/, id);
    }
    const original = downloads[id];
    assert.ok(original.status === "uploaded" || original.rebuilt_artifact?.status === "uploaded", id);
  }
});

test("Twelve reconstructions match catalog namespaces, versions and source ZIPs", () => {
  assert.equal(Object.keys(newBuilds).length, 12);
  for (const [id, build] of Object.entries(newBuilds)) {
    const item = catalog.find(item => item.id === id);
    assert.equal(build.original_poggit_artifact, false, id);
    assert.equal(build.antigen, item.namespace, id);
    if (item.version) assert.equal(build.virion_version, item.version, id);
    assert.equal(build.source_commit, sources[id].source_commit, id);
    assert.equal(build.source_zip_sha256, sources[id].sha256, id);
    assert.equal(build.remote_url, downloads[id].rebuilt_artifact.remote_url, id);
    assert.equal(build.builder_commit, "d3bcaa5bbe5344996fb06b6192ca37be980dd7eb", id);
    assert.match(build.remote_url, asset, id);
    assert.equal(build.sha256, build.remote_sha256, id);
  }
});

test("The three previously blocked public sources preserve No License explicitly", () => {
  for (const id of ["inxomnyaa/libstructure/libstructure@0.4.0", "adeynes/parsecmd/parsecmd@latest", "cosmoverse/blockdata/blockdata@latest"]) {
    assert.equal(sources[id].license_display, "No License");
    assert.equal(newBuilds[id].license_spdx, "No License");
    assert.deepEqual(sources[id].license_files, []);
  }
  assert.equal(newBuilds["adeynes/parsecmd/parsecmd@latest"].virion_version, "5.0.1");
  assert.equal(newBuilds["cosmoverse/blockdata/blockdata@latest"].virion_version, "0.0.3");
  assert.match(newBuilds["luca28pet/configparser/configparser@1.0.1"].adjustments[0].change, /api: \[\]/);
});

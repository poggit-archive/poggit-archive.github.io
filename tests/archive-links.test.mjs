import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

const node = { addEventListener() {}, querySelectorAll() { return []; } };
const document = { querySelector() { return node; }, querySelectorAll() { return []; }, addEventListener() {} };
const script = readFileSync(new URL("../public/app.js", import.meta.url), "utf8")
  .replace("  init();", "  globalThis.archiveTest = { state, sourceArtifact, artifactFor };");
const context = vm.createContext({ document, URL, location: { hostname: "poggit-archive.github.io" } });
vm.runInContext(script, context);
const { state, sourceArtifact, artifactFor } = context.archiveTest;
const url = "https://github.com/poggit-archive/artifacts/releases/download/test/source.zip";
const sha = "a".repeat(40);
const item = { id: "owner/repo/lib@1.0.0" };

test("Virion labels distinguish original build revisions, rebuild sources and PHAR files", () => {
  state.kind = "virions";
  const source = { status: "uploaded", remote_url: url, method: "git_archive", complete_git_snapshot: true, verified_revision: sha, source_scope: "original_poggit_build" };
  state.virionSources[item.id] = source;
  assert.equal(sourceArtifact(item).label, "Archived source");
  source.source_scope = "rebuilt_phar";
  assert.equal(sourceArtifact(item).label, "Rebuild source");
  assert.match(sourceArtifact(item).details, /original Poggit revision is unconfirmed/);
  source.method = "unphar";
  source.complete_git_snapshot = false;
  assert.equal(sourceArtifact(item).label, "Source from PHAR");
});

test("Source links require a verified published archive asset and known provenance", () => {
  state.kind = "virions";
  const source = { status: "downloaded", remote_url: url, method: "git_archive", complete_git_snapshot: true, verified_revision: sha, source_scope: "rebuilt_phar" };
  state.virionSources[item.id] = source;
  assert.equal(sourceArtifact(item), null);
  source.status = "uploaded";
  for (const remote of ["https://github.com/owner/repo/archive/main.zip", "https://github.com.example.com/poggit-archive/artifacts/releases/download/test/source.zip", url.replace("https:", "http:")]) {
    source.remote_url = remote;
    assert.equal(sourceArtifact(item), null);
  }
  source.remote_url = url;
  source.verified_revision = "main";
  assert.equal(sourceArtifact(item), null);
  source.verified_revision = sha;
  source.source_scope = "unresolved";
  assert.equal(sourceArtifact(item), null);
});

test("Original PHAR is preferred over a reconstruction, which keeps its own label", () => {
  state.kind = "virions";
  state.virionDownloads[item.id] = { status: "uploaded", remote_url: url, rebuilt_artifact: { status: "uploaded", remote_url: url + "2" } };
  assert.equal(artifactFor(item).label, "Archived PHAR");
  state.virionDownloads[item.id].status = "failed";
  assert.equal(artifactFor(item).label, "Rebuilt PHAR");
});

test("Plugin source priority and PHAR fallback remain intact", () => {
  state.kind = "plugins";
  const plugin = { id: 1, repo_id: 10, build_commit: sha };
  state.sourceDownloads[`10@${sha}`] = { status: "uploaded", remote_url: url };
  state.recoveredSources["1"] = { status: "uploaded", method: "unphar", complete_git_snapshot: false, remote_url: url };
  assert.equal(sourceArtifact(plugin).label, "Archived source");
  delete state.sourceDownloads[`10@${sha}`];
  assert.equal(sourceArtifact(plugin).label, "Source from PHAR");
});

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import { getCatalog, releaseView, projectPath, versionPath, cleanDocument, apiRanges, sourceArtifact } from "../src/lib/plugin-details.mjs";

const catalog = getCatalog();
const projects = [...catalog.projects.values()];
const releases = projects.flatMap((project) => project.releases);
const digest = (kind, value) => createHash(kind).update(value).digest("hex");

test("Every captured project and release has a unique static route, including colliding names", () => {
  assert.equal(projects.length, 1450);
  assert.equal(releases.length, 5021);
  const paths = projects.flatMap((project) => [project.path, ...project.releases.map((release) => versionPath(project, release))]);
  assert.equal(new Set(paths).size, 6471);
  const trampolines = projects.filter((project) => project.latest.name.toLowerCase() === "trampoline");
  assert.equal(trampolines.length, 2);
  assert.notEqual(trampolines[0].path, trampolines[1].path);
  for (const project of projects) {
    assert.equal(project.path, projectPath(project.latest));
    assert.equal(project.totalDownloads, project.releases.reduce((sum, release) => sum + release.downloads, 0));
    assert.equal(project.latest.id, Math.max(...project.releases.map((release) => release.id)));
  }
});

test("Imported documents retain Git blob identity and every manifest is tied to the verified original PHAR", () => {
  assert.equal(catalog.details.snapshot_id, catalog.pointer.snapshot_id);
  let descriptions = 0, changelogs = 0;
  const missing = [];
  for (const release of releases) {
    const record = catalog.details.records[String(release.id)];
    assert.ok(record.manifest);
    assert.equal(record.phar.sha256, catalog.downloads[String(release.id)].remote_sha256);
    assert.equal(record.phar.bytes, catalog.downloads[String(release.id)].bytes);
    assert.match(record.phar.sha1, /^[a-f0-9]{40}$/);
    assert.match(record.phar.md5, /^[a-f0-9]{32}$/);
    if (!record.archive_path) missing.push(String(release.id));
    if (record.commit) assert.equal(record.commit, release.build_commit);
    for (const [filename, document] of Object.entries(record.documents)) {
      const buffer = Buffer.from(document.content);
      assert.equal(digest("sha256", buffer), document.sha256, `Document digest for ${release.id}/${filename}`);
      assert.equal(digest("sha1", Buffer.concat([Buffer.from(`blob ${buffer.length}\0`), buffer])), document.git_blob);
      if (filename.startsWith("description.")) descriptions++;
      if (filename.startsWith("changelog.")) changelogs++;
    }
  }
  assert.equal(descriptions, 5020);
  assert.equal(changelogs, 3636);
  assert.deepEqual(missing, ["13728"]);
});

test("Switching versions changes documents, manifest and archived downloads without changing project totals", () => {
  const project = catalog.projects.get("420");
  const latest = releaseView(project.latest, catalog);
  const previous = releaseView(project.releases.find((release) => release.id === 12098), catalog);
  assert.match(latest.download, /plugin-14252-/);
  assert.match(previous.download, /plugin-12098-/);
  assert.notEqual(latest.descriptionUrl, previous.descriptionUrl);
  assert.notEqual(latest.changelogUrl, previous.changelogUrl);
  assert.notEqual(latest.changelogHtml, previous.changelogHtml);
  assert.equal(latest.manifest.version, "2.1.2");
  assert.equal(previous.manifest.version, "2.1.1");
  assert.equal(project.totalDownloads, 111547);
  assert.equal(apiRanges({ api: [{ from: "3.0.0", to: "3.2.0" }, { from: "4.0.0", to: "4.0.0" }] }), "3.0.0 – 3.2.0, 4.0.0");
});

test("Catalog links resolve to the same generated routes for every selected version", () => {
  const node = { addEventListener() {}, querySelectorAll() { return []; } };
  const document = { querySelector() { return node; }, querySelectorAll() { return []; }, addEventListener() {} };
  const script = readFileSync(new URL("../public/app.js", import.meta.url), "utf8").replace("  init();", "  globalThis.routeTest = pluginDetailPath;");
  const context = vm.createContext({ document, URL });
  vm.runInContext(script, context);
  for (const project of projects) for (const release of project.releases) {
    assert.equal(context.routeTest(project, release), release.id === project.latest.id ? project.path : versionPath(project, release));
  }
});

test("Archive source provenance and missing licenses stay explicit on detail pages", () => {
  const fallback = releases.filter((release) => catalog.sources[`${release.repo_id}@${release.build_commit}`]?.status !== "uploaded");
  assert.equal(fallback.length, 23);
  for (const release of fallback) assert.equal(releaseView(release, catalog).source.label, "Source from PHAR");
  for (const release of releases.filter((release) => !release.license)) assert.equal(releaseView(release, catalog).license, "No License");
  const release = releases[0];
  assert.equal(sourceArtifact(release, { [`${release.repo_id}@${release.build_commit}`]: { status: "uploaded", remote_url: "https://github.com.example.com/poggit-archive/artifacts/releases/download/fake/source.zip" } }, {}), null);
  const missing = releaseView(releases.find((row) => row.id === 13728), catalog);
  assert.equal(missing.descriptionHtml, "");
  assert.ok(missing.manifest.main);
});

test("Archived HTML is inert, links are resolved and document IDs cannot shadow the page", () => {
  const release = { repo_name: "owner/repo", build_commit: "a".repeat(40) };
  const html = cleanDocument({ format: "html", content: '<script>alert(1)</script><style>body{display:none}</style><iframe src="https://evil.test"></iframe><form><input name="location"></form><a id="download" href="javascript:alert(1)" onclick="evil()">Bad</a><img src="data:image/svg+xml,test" onerror="evil()"><a href="docs/help.md">Help</a><img src="images/test.png"><a id="user-content-start" href="#start">Section</a><h2 id="plugin-title">Title</h2>' }, release);
  assert.doesNotMatch(html, /<script|<style|<iframe|<form|<input|onclick|onerror|javascript:|data:image/i);
  assert.match(html, /id="archived-description-download"/);
  assert.match(html, /id="archived-description-plugin-title"/);
  assert.match(html, /href="#archived-description-start"/);
  assert.match(html, /href="https:\/\/github.com\/owner\/repo\/blob\/a{40}\/docs\/help.md"/);
  assert.match(html, /src="https:\/\/raw.githubusercontent.com\/owner\/repo\/a{40}\/images\/test.png"/);
  assert.match(cleanDocument({ format: "txt", content: '<script>alert(1)</script>' }, release), /&lt;script&gt;/);
});

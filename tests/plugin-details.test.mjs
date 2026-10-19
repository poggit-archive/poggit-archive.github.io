import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import { getCatalog, releaseView, projectPath, versionPath, authorPath, cleanDocument, apiRanges, sourceArtifact, versionApiLabel } from "../src/lib/plugin-details.mjs";

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
  assert.equal(latest.download, `/archive-files/${latest.record.phar.sha256}.phar`);
  assert.equal(previous.download, `/archive-files/${previous.record.phar.sha256}.phar`);
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

test("Author links select exact accounts across recorded owners without matching similar usernames", () => {
  const node = { addEventListener() {}, querySelectorAll() { return []; } };
  const document = { querySelector() { return node; }, querySelectorAll() { return []; }, addEventListener() {} };
  const script = readFileSync(new URL("../public/app.js", import.meta.url), "utf8")
    .replace("  init();", "  globalThis.navigationTest = { state, filteredRows, pluginAuthorPath };");
  const context = vm.createContext({ document, URL });
  vm.runInContext(script, context);
  const navigation = context.navigationTest;
  navigation.state.pluginProjects = [
    { title: "Current", totalDownloads: 30, releases: [{ repo_name: "CzechPMDevs/Current" }] },
    { title: "Transferred", totalDownloads: 20, releases: [{ repo_name: "NewOwner/Transferred" }, { repo_name: "czechpmdevs/Transferred" }] },
    { title: "Similar", totalDownloads: 10, releases: [{ repo_name: "CzechPMDevsExtra/Similar" }] },
  ];
  navigation.state.searchField = "author";
  navigation.state.query = "czechpmdevs";
  navigation.state.exactAuthor = true;
  assert.deepEqual(Array.from(navigation.filteredRows(), (row) => row.title), ["Current", "Transferred"]);
  navigation.state.exactAuthor = false;
  assert.equal(navigation.filteredRows().length, 3);
  for (const name of ["CzechPMDevs", "poggit-orphanage", "name & other/#?"]) {
    const path = navigation.pluginAuthorPath(name);
    assert.equal(path, authorPath(name));
    const url = new URL(path, "https://poggit-archive.github.io");
    assert.equal(url.pathname, "/");
    assert.equal(url.searchParams.get("author"), name);
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
  assert.match(html, /src="\/assets\/image-unavailable.svg"/);
  assert.match(cleanDocument({ format: "txt", content: '<script>alert(1)</script>' }, release), /&lt;script&gt;/);
});

test("Image layout uses verified display dimensions rather than untrusted document attributes", () => {
  const release = { id: 1, repo_name: "owner/repo", build_commit: "a".repeat(40) };
  const original = "https://example.test/image.png";
  const media = { by_release: { "1": { images: { [original]: "image" } } }, resources: { image: { status: "preserved", path: "/archive-media/image.png", width: 640, height: 360 } } };
  const html = cleanDocument({ format: "html", content: `<img src="${original}" width="99999" height="99999" style="position:fixed">` }, release, { media });
  assert.match(html, /width="640" height="360"/);
  assert.doesNotMatch(html, /99999|style=/);
  media.resources.image.width = -1;
  const invalid = cleanDocument({ format: "html", content: `<img src="${original}" width="99999">` }, release, { media });
  assert.doesNotMatch(invalid, /width=|height=/);
});

test("Catalog and detail icons agree for every release, including missing and failed images", () => {
  const node = { addEventListener() {}, querySelectorAll() { return []; } };
  const document = { querySelector() { return node; }, querySelectorAll() { return []; }, addEventListener() {}, createElement() { return { events: {}, addEventListener(name, callback) { this.events[name] = callback; } }; } };
  const script = readFileSync(new URL("../public/app.js", import.meta.url), "utf8")
    .replace("  init();", "  globalThis.iconsTest = { state, pluginIconUrl, updatePluginIcon };");
  const context = vm.createContext({ document, URL });
  vm.runInContext(script, context);
  const icons = context.iconsTest;
  icons.state.icons = Object.fromEntries(Object.entries(catalog.media.by_release).map(([id, media]) => [id, catalog.media.resources[media.icon]?.path || null]));
  for (const release of releases) assert.equal(icons.pluginIconUrl(release), releaseView(release, catalog).iconUrl);
  for (const name of ["SkyBlock", "EasyCommandAutofill"]) {
    const release = projects.find((project) => project.latest.name === name).latest;
    assert.equal(icons.pluginIconUrl(release), "/assets/plugin.svg");
    assert.match(releaseView(release, catalog).iconTitle, /Default plugin icon/);
  }
  const frame = { children: [], replaceChildren() { this.children = []; }, append(image) { this.children.push(image); } };
  const preserved = releases.find((release) => icons.state.icons[release.id]);
  icons.updatePluginIcon(frame, preserved);
  assert.equal(frame.children.length, 1);
  assert.match(frame.children[0].src, /^\/archive-media\//);
  frame.children[0].events.error();
  assert.equal(frame.children.length, 1);
  assert.equal(frame.children[0].src, "/assets/plugin.svg");
  icons.updatePluginIcon(frame, releases.find((release) => !icons.state.icons[release.id]));
  assert.equal(frame.children[0].src, "/assets/plugin.svg");
  icons.updatePluginIcon(frame, preserved);
  assert.match(frame.children[0].src, /^\/archive-media\//);
});

test("Version menus preserve exact API ranges and disclose missing compatibility metadata", () => {
  const node = { addEventListener() {}, querySelectorAll() { return []; } };
  const document = { querySelector() { return node; }, querySelectorAll() { return []; }, addEventListener() {} };
  const script = readFileSync(new URL("../public/app.js", import.meta.url), "utf8").replace("  init();", "  globalThis.apiLabelTest = versionApiLabel;");
  const context = vm.createContext({ document, URL });
  vm.runInContext(script, context);
  for (const release of releases) assert.equal(context.apiLabelTest(release), versionApiLabel(release));
  const builder = projects.find((project) => project.latest.name === "BuilderTools");
  assert.equal(versionApiLabel(builder.latest), "API 5.0.0 - 5.36.0");
  assert.equal(versionApiLabel(builder.releases.find((release) => release.version === "1.4.0")), "API 4.0.0 - 4.21.1");
  assert.equal(versionApiLabel({ api: [{ from: "2.0.0", to: "2.1.0" }, { from: "3.0.0-ALPHA3", to: "3.0.0-ALPHA3" }] }), "API 2.0.0 - 2.1.0, 3.0.0-ALPHA3");
  assert.equal(context.apiLabelTest({}), "API not recorded");
  assert.equal(versionApiLabel({ api: [] }), "API not recorded");
});

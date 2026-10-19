import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import sanitizeHtml from "sanitize-html";
import test from "node:test";
import sharp from "sharp";
import { getCatalog, cleanDocument, releaseView, localReference, versionPath, mediaTitle } from "../src/lib/plugin-details.mjs";
import { imageUrl, frozenImageUrl } from "../src/lib/media-urls.mjs";
import { inertSvg, displayImage } from "../src/lib/preserved-image.mjs";

const catalog = getCatalog();
const projects = [...catalog.projects.values()];
const releases = projects.flatMap((project) => project.releases);
const digest = (value) => createHash("sha256").update(value).digest("hex");

test("Recovery evidence distinguishes release source revisions, archive captures and other revisions", () => {
  const audit = JSON.parse(readFileSync(resolve("data/snapshots", catalog.pointer.snapshot_id, "media-recovery-audit.json"), "utf8"));
  const records = Object.entries(audit.records);
  assert.equal(records.length, audit.baseline_unavailable);
  assert.equal(audit.recovered + audit.remaining, audit.baseline_unavailable);
  for (const [key, row] of records) {
    assert.equal(row.baseline_status, "unavailable");
    assert.equal(row.status, catalog.media.resources[key].status);
    if (row.status !== "preserved") continue;
    assert.equal(row.sha256, catalog.media.resources[key].sha256);
    if (row.revision_verified) {
      assert.match(row.source_revision, /^[a-f0-9]{40}$/);
      if (row.source_zip_sha256) assert.ok(Object.values(catalog.sources).some((source) => source.sha256 === row.source_zip_sha256 && source.commit === row.source_revision));
    } else {
      assert.match(mediaTitle(row), /not.*verified|unverified/i);
    }
    if (row.method === "wayback_capture") {
      assert.match(row.wayback_timestamp, /^\d{14}$/);
      assert.match(row.fetched_url, /^https:\/\/web\.archive\.org\/web\/\d{14}id_\//);
    }
  }
});

test("Preserved display media and local SVG originals match checksums; remote originals have verified owned archive identities", () => {
  const seen = new Set();
  const counts = { preserved: 0, reconstructed: 0, unavailable: 0 };
  for (const resource of Object.values(catalog.media.resources)) {
    counts[resource.status]++;
    if (resource.status === "unavailable") {
      assert.ok(!resource.path);
      assert.ok(resource.attempts.length);
      continue;
    }
    assert.match(resource.path, /^\/archive-media\/[a-f0-9]{64}\.(png|jpg|gif|webp|avif)$/);
    if (resource.status === "reconstructed") {
      assert.equal(resource.method, "snapshot_metadata_label");
      assert.equal(resource.source_snapshot_id, catalog.pointer.snapshot_id);
      assert.equal(resource.original_sha256, undefined);
    }
    if (resource.original_archive) {
      assert.match(resource.original_archive.url, /^https:\/\/github\.com\/poggit-archive\/artifacts\/releases\/download\//);
      assert.equal(resource.original_archive.digest, `sha256:${resource.original_sha256}`);
      assert.equal(resource.original_archive.bytes, resource.original_bytes);
      assert.equal(resource.original_path, undefined);
    }
    for (const [path, sha] of [[resource.path, resource.sha256], [resource.original_path || resource.generated_svg_path, resource.original_sha256 || resource.generated_svg_sha256]]) {
      if (!path && resource.original_archive) continue;
      if (seen.has(path)) continue;
      seen.add(path);
      assert.equal(digest(readFileSync(resolve("public", path.slice(1)))), sha, path);
    }
  }
  for (const [status, count] of Object.entries(counts)) assert.equal(count, catalog.mediaReport[status]);
  assert.equal(Object.keys(catalog.media.resources).length, catalog.mediaReport.image_contexts);
});

test("Chrome recheck accounts for every baseline context and keeps related copies distinct", () => {
  const audit = JSON.parse(readFileSync(resolve("data/snapshots", catalog.pointer.snapshot_id, "media-chrome-audit.json"), "utf8"));
  assert.equal(Object.keys(audit.records).length, audit.baseline_unavailable);
  assert.equal(audit.recovered + audit.remaining, audit.baseline_unavailable);
  assert.equal(audit.original_url_captures + audit.related_url_copies, audit.recovered);
  assert.equal(audit.url_checks.length + audit.genboy.unique_image_urls, new Set(Object.values(audit.records).map((row) => row.capture_url)).size);
  assert.equal(audit.genboy.recovered, 0);
  assert.deepEqual(audit.genboy.matching_media_urls, []);
  for (const check of audit.url_checks) {
    assert.equal(check.lookup, "all_mime_types");
    assert.ok(["no_successful_capture", "captures_found"].includes(check.result), check.result);
    assert.ok(check.chrome_query_url.startsWith("https://web.archive.org/cdx/"));
  }
  for (const [key, row] of Object.entries(audit.records)) {
    assert.equal(row.status, catalog.media.resources[key].status);
    if (row.status === "preserved") {
      assert.equal(row.revision_verified, false);
      if (row.capture_scope === "original_url") assert.equal(row.archived_original_url, row.capture_url);
      else {
        assert.equal(row.capture_scope, "related_repository_url");
        assert.notEqual(row.archived_original_url, row.capture_url);
        assert.ok(audit.records[row.source_resource_key]);
      }
    } else assert.match(row.attempts.at(-1), /Chrome recheck/);
  }
});

test("Inline SVG raster images remain visible without allowing network or nested SVG images", async () => {
  const red = await sharp({ create: { width: 1, height: 1, channels: 4, background: "red" } }).png().toBuffer();
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="3" height="1"><image x="0" y="0" width="1" height="1" href="data:image/png;base64,${red.toString("base64")}"/><image x="1" width="1" height="1" href="https://invalid.example/remote.png"/><image x="2" width="1" height="1" href="data:image/svg+xml;base64,${Buffer.from('<svg/>').toString('base64')}"/></svg>`);
  const display = await displayImage(svg);
  const pixels = await sharp(display.bytes).ensureAlpha().raw().toBuffer();
  assert.deepEqual([...pixels.subarray(0, 4)], [255, 0, 0, 255]);
  assert.equal(pixels[7], 0);
  assert.equal(pixels[11], 0);
});

test("Local animated WebP copies retain original GIF frame counts, timing and verified archive identity", async () => {
  for (const resource of Object.values(catalog.media.resources).filter((row) => row.original_archive)) {
    const metadata = await sharp(resolve("public", resource.path.slice(1))).metadata();
    const conversion = resource.display_transformation;
    assert.equal(conversion.kind, "lossless_animated_webp");
    assert.equal(metadata.pages, conversion.pages);
    assert.equal(metadata.loop, conversion.loop);
    assert.deepEqual(metadata.delay, conversion.delay);
    assert.equal(conversion.verification.pixel_samples.length, 3);
    assert.equal(resource.original_archive.status, "uploaded");
  }
});

test("Every archived HTML document embeds only local images, including unavailable-image placeholders", () => {
  for (const release of releases) {
    const record = catalog.details.records[String(release.id)];
    for (const [filename, document] of Object.entries(record.documents)) {
      if (!filename.endsWith(".html")) continue;
      const html = cleanDocument({ ...document, filename, format: "html" }, release, catalog);
      sanitizeHtml(html, { allowedTags: [], transformTags: { img: (tagName, attributes) => {
        assert.match(attributes.src, /^\/(archive-media\/[a-f0-9]{64}\.(png|jpg|gif|webp|avif)|assets\/image-unavailable.svg)$/);
        assert.equal(attributes.srcset, undefined);
        return { tagName, attribs: attributes };
      } } });
    }
    const view = releaseView(release, catalog);
    assert.ok(view.iconUrl.startsWith("/"));
    if (view.descriptionUrl) assert.match(view.descriptionUrl, /^\/plugin-documents\/\d+\/description\.(html|txt)\.txt$/);
  }
});

test("Poggit references resolve to exact local releases, documents, downloads and recorded builds", () => {
  const project = catalog.projects.get("420"), latest = project.latest;
  const older = project.releases.find((release) => release.id === 12098);
  assert.equal(localReference("https://poggit.pmmp.io/p/MultiWorld/2.1.1", latest, catalog), versionPath(project, older));
  assert.equal(localReference("https://poggit.pmmp.io/p/MultiWorld", latest, catalog), project.path);
  assert.equal(localReference(latest.artifact_url, latest, catalog), `/archive-files/${catalog.downloads[String(latest.id)].sha256}.phar`);
  assert.equal(localReference(latest.description_url, latest, catalog), `/plugin-documents/${latest.id}/description.html.txt`);
  assert.equal(localReference(`https://poggit.pmmp.io/ci/${latest.repo_name}/${latest.project_name}/${latest.build_number}`, latest, catalog), versionPath(project, latest) + "#build-record");
  assert.equal(localReference("https://poggit.pmmp.io/p/not-in-the-snapshot/99", latest, catalog), "/preservation/#historical-links");
});

test("Mutable own-repository image references are frozen per release revision", () => {
  const old = { repo_name: "owner/repo", build_commit: "a".repeat(40) };
  const recent = { ...old, build_commit: "b".repeat(40) };
  const url = "https://github.com/owner/repo/blob/main/images/banner.png";
  assert.equal(imageUrl(url, old), "https://raw.githubusercontent.com/owner/repo/main/images/banner.png");
  assert.match(frozenImageUrl(url, old), /\/a{40}\/images\/banner.png$/);
  assert.match(frozenImageUrl(url, recent), /\/b{40}\/images\/banner.png$/);
});

test("All published plugin PHARs have local checksum-verified copies and GitHub remains a backup", () => {
  const verified = new Set();
  for (const [url, resource] of Object.entries(catalog.files.resources)) {
    assert.ok(url.startsWith("https://github.com/poggit-archive/artifacts/releases/download/"));
    assert.match(resource.path, /^\/archive-files\/[a-f0-9]{64}\.(phar|zip)$/);
    if (!verified.has(resource.path)) {
      const bytes = readFileSync(resolve("public", resource.path.slice(1)));
      assert.equal(bytes.length, resource.bytes);
      assert.equal(digest(bytes), resource.sha256);
      verified.add(resource.path);
    }
  }
  for (const release of releases) {
    const view = releaseView(release, catalog);
    assert.equal(view.download, `/archive-files/${view.record.phar.sha256}.phar`);
    assert.ok(view.downloadBackup.startsWith("https://github.com/poggit-archive/artifacts/releases/download/"));
  }
});

test("SVG display conversion strips active and external references while preserving captured source bytes", async () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="24"><script>evil()</script><image href="file:///secret.png"/><use href="https://evil.test/a.svg#x"/><foreignObject><iframe src="https://evil.test"/></foreignObject><rect width="100" height="24" fill="#444"/><text x="2" y="16" fill="#fff">Saved</text></svg>';
  assert.doesNotMatch(inertSvg(svg), /script|secret|evil|foreignObject|iframe|https:\/\//);
  const converted = await displayImage(Buffer.from(svg));
  assert.equal(converted.extension, "png");
  assert.equal(converted.transformed, true);
  assert.ok(converted.bytes.length > 100);
});

// Export the investigation separately from immutable release metadata.
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getCatalog } from "../src/lib/plugin-details.mjs";

const catalog = getCatalog();
const directory = resolve("data/snapshots", catalog.pointer.snapshot_id);
async function json(path, fallback) {
  try { return JSON.parse(await readFile(resolve(path), "utf8")); }
  catch (error) { if (error.code !== "ENOENT") throw error; return fallback; }
}
const previous = await json(resolve(directory, "media-recovery-audit.json"), {});
const baseline = await json("archive/media-followup/baseline.json", previous.records || {});
if (!Object.keys(baseline).length) throw new Error("Save the missing-resource baseline before recovery");
const research = await json("archive/media-followup/audit.json", {});
const repositoryChecks = await json("archive/media-followup/repository-audit.json", []);
const forkChecks = await json("archive/media-followup/fork-audit.json", []);
const iconCdx = await json("archive/media-followup/icon-cdx.json", []);
const browserCaptures = await json("archive/media-followup/browser-captures.json", []);
const records = {};
for (const key of Object.keys(baseline)) {
  const resource = catalog.media.resources[key];
  if (!resource) throw new Error(`Unknown baseline media context ${key}`);
  records[key] = {
    ...resource,
    baseline_status: "unavailable",
    checks: {
      wayback_availability: research.wayback?.[resource.capture_url] || null,
      wayback_cdx: research.cdx?.find((row) => row.url === resource.capture_url) || null,
      zip: [...(research.zip?.results || []), ...(research.local?.results || [])].filter((row) => row.key === key),
      repository: repositoryChecks.filter((row) => row.key === key),
      forks: forkChecks.filter((row) => row.key === key),
      browser_captures: browserCaptures.filter((row) => row.key === key),
      related_repository_cdx: iconCdx.filter(([repo]) => resource.capture_url.toLowerCase().startsWith(`https://raw.githubusercontent.com/${repo.toLowerCase()}/`)),
    },
  };
}
const resources = Object.values(records);
const recovered = resources.filter((row) => row.status === "preserved");
const byMethod = recovered.reduce((counts, row) => { counts[row.method] = (counts[row.method] || 0) + 1; return counts; }, {});
const report = {
  schema_version: 1,
  snapshot_id: catalog.pointer.snapshot_id,
  batch: "missing-media-2026-10-19",
  checked_at: new Date().toISOString(),
  baseline_unavailable: resources.length,
  recovered: recovered.length,
  remaining: resources.filter((row) => row.status === "unavailable").length,
  release_revision_verified: recovered.filter((row) => row.revision_verified === true).length,
  by_method: byMethod,
  wayback_urls_checked: Object.keys(research.wayback || {}).length,
  cdx_urls_checked: research.cdx?.length || 0,
  source_zip_checks: (research.zip?.archives_checked || 0) + (research.local?.archives_checked || 0),
  repository_checks: repositoryChecks.filter((row) => !row.key),
  fork_checks: forkChecks.filter((row) => !row.key),
  records,
};
await writeFile(resolve(directory, "media-recovery-audit.json"), JSON.stringify(report) + "\n");
console.log(JSON.stringify({ ...report, records: undefined, repository_checks: undefined, fork_checks: undefined }, null, 2));

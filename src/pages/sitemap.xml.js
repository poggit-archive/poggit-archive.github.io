import { getCatalog, versionPath } from "../lib/plugin-details.mjs";

export function GET() {
  const urls = ["/", "/leaderboard/", "/memory/", "/preservation/"];
  for (const project of getCatalog().projects.values()) {
    urls.push(project.path, ...project.releases.map((release) => versionPath(project, release)));
  }
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((path) => `<url><loc>https://poggit-archive.github.io${path}</loc></url>`).join("\n")}</urlset>`, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}

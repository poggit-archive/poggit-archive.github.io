(() => {
  const main = document.querySelector("[data-virion-id]");
  if (!main) return;
  const targets = [...main.querySelectorAll("[data-virion-document]")];
  const originals = new Map(targets.map((target) => [target, [...target.childNodes]]));
  const element = (tag, text) => { const node = document.createElement(tag); if (text != null) node.textContent = text; return node; };
  for (const target of targets) { target.setAttribute("aria-busy", "true"); window.ArchiveLoading?.panel(target, "Loading preserved documentation…"); }
  async function load() {
    try {
      const url = main.dataset.virionDocuments;
      if (!/^\/virion-documents\/[a-f0-9]{64}\.json\.gz$/.test(url)) throw new Error("Invalid local documentation URL");
      const response = await fetch(url, { cache: "force-cache", signal: AbortSignal.timeout(15000) });
      if (!response.ok || !response.body) throw new Error("Documentation unavailable");
      const payload = await new Response(response.body.pipeThrough(new DecompressionStream("gzip"))).json();
      const record = payload.records[main.dataset.virionId];
      if (payload.schema_version !== 1 || !record) throw new Error("Documentation record unavailable");
      for (const target of targets) {
        const kind = target.dataset.virionDocument;
        if (["readme", "changelog"].includes(kind)) {
          const documentRecord = payload.documents[record[kind]];
          if (!documentRecord) { target.replaceChildren(...originals.get(target)); continue; }
          const content = new DOMParser().parseFromString(documentRecord.html, "text/html");
          target.replaceChildren(...content.body.childNodes);
          target.dispatchEvent(new Event("archive-document-ready", { bubbles: true }));
        } else if (kind === "licenses") {
          target.replaceChildren();
          if (!record.licenses.length) { target.replaceChildren(...originals.get(target)); continue; }
          for (const license of record.licenses) { const details = element("details"), summary = element("summary", license.path), pre = element("pre", payload.documents[license.document].text); details.className = "full-license"; details.append(summary, pre); target.append(details); }
        } else if (kind === "files") {
          target.replaceChildren();
          if (!Object.keys(record.files).length) { target.replaceChildren(...originals.get(target)); continue; }
          for (const id of Object.values(record.files)) { const file = payload.documents[id], details = element("details"); details.className = "raw-manifest"; details.append(element("summary", file.path), element("pre", file.text)); target.append(details); }
        } else if (kind === "users") {
          target.replaceChildren();
          if (!record.users.length) { target.replaceChildren(...originals.get(target)); continue; }
          const list = element("ul"); list.className = "dependency-list";
          for (const user of record.users) { const row = element("li"), link = element("a", user.name); if (!/^\/plugins\/[a-z0-9-]+\/$/.test(user.path)) continue; link.href = user.path; row.append(link, element("span", user.version)); list.append(row); }
          target.append(list);
        }
      }
      if (record.missingImages) main.querySelector("[data-virion-missing-images]").textContent = ` ${record.missingImages} README/changelog image references have no preserved preview.`;
    } catch {
      const message = main.querySelector(".source-download")
        ? "Documentation could not be loaded. Preserved files remain available in the source ZIP."
        : "Documentation could not be loaded. Preserved catalog metadata remains available below.";
      for (const target of targets) { target.replaceChildren(...originals.get(target)); target.prepend(element("p", message)); }
    } finally { for (const target of targets) target.removeAttribute("aria-busy"); }
  }
  load();
})();

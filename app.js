(() => {
  const PAGE_SIZE = 40;
  const state = {
    kind: "plugins",
    page: 1,
    query: "",
    releases: [],
    virions: [],
    pluginDownloads: {},
    virionDownloads: {},
    sourceDownloads: {},
  };
  const $ = (selector) => document.querySelector(selector);
  const results = $("#results");

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text).replace(/[\u2013\u2014]/g, "-");
    return node;
  }

  function number(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return "0";
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(parsed);
  }

  function date(value) {
    const parsed = new Date(Number(value) * 1000);
    if (!Number.isFinite(parsed.getTime())) return "Date unknown";
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(parsed);
  }

  function snapshotDate(value) {
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime())) return value || "unknown date";
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(parsed);
  }

  function cleanText(value) {
    return String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  }

  function link(text, href, className, external = false) {
    const anchor = element("a", className, text);
    anchor.href = href;
    if (external) {
      anchor.target = "_blank";
      anchor.rel = "noreferrer";
    }
    return anchor;
  }

  function sourceUrl(item) {
    if (state.kind === "plugins") {
      if (!item.repo_name || !/^[\w.-]+\/[\w.-]+$/.test(item.repo_name)) return null;
      return `https://github.com/${item.repo_name}`;
    }
    return item.source_url && /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(item.source_url)
      ? item.source_url
      : null;
  }

  function archiveUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && url.hostname === "github.com" && url.pathname.startsWith("/poggit-archive/artifacts/releases/download/");
    } catch {
      return false;
    }
  }

  function sourceArtifact(item) {
    if (state.kind === "plugins" && item.repo_id && item.build_commit) {
      const key = `${item.repo_id}@${String(item.build_commit).toLowerCase()}`;
      const archived = state.sourceDownloads[key];
      if (archived?.status === "uploaded" && archiveUrl(archived.remote_url)) {
        return { url: archived.remote_url, label: "Archived source" };
      }
    }
    const url = sourceUrl(item);
    return url ? { url, label: "Source" } : null;
  }

  function artifactFor(item) {
    const key = String(item.id);
    const downloads = state.kind === "plugins" ? state.pluginDownloads : state.virionDownloads;
    const local = downloads[key];
    if (local?.status === "uploaded" && archiveUrl(local.remote_url)) {
      return { url: local.remote_url, label: "Archived PHAR", local: false };
    }
    const localPreview = ["localhost", "127.0.0.1", "::1"].includes(location.hostname);
    if (localPreview && local && ["downloaded", "already_present"].includes(local.status) && local.storage_path) {
      return { url: new URL(local.storage_path, new URL("./", location.href)).href, label: "Archived PHAR", local: true };
    }
    const url = state.kind === "plugins" ? item.artifact_url : item.poggit_download_url;
    return { url, label: "Poggit download", local: false };
  }

  function addMeta(container, value) {
    if (value === undefined || value === null || value === "") return;
    container.append(element("span", "", value));
  }

  function renderRow(item) {
    const row = element("article", "result-row");
    const content = element("div", "result-content");
    const title = item.name || item.project_name || "Unnamed project";
    content.append(element("h2", "result-title", title));

    const description = state.kind === "plugins"
      ? cleanText(item.tagline || item.description || "No description recorded")
      : cleanText(item.namespace || "Virion");
    content.append(element("p", "result-description", description));

    const meta = element("p", "result-meta");
    addMeta(meta, item.version || "Version unknown");
    if (state.kind === "plugins") {
      addMeta(meta, `${number(item.downloads)} downloads`);
      addMeta(meta, item.state_name);
      addMeta(meta, item.license ? `License ${item.license}` : "License unknown");
    } else {
      addMeta(meta, `${number(item.used_by_projects)} projects use this`);
      if (item.last_updated) addMeta(meta, date(Number(item.last_updated)));
    }
    content.append(meta);

    const actions = element("div", "result-actions");
    const source = sourceArtifact(item);
    if (source) actions.append(link(source.label, source.url, "", true));
    if (state.kind === "plugins" && item.html_url && /^https:\/\/poggit\.pmmp\.io\//.test(item.html_url)) {
      actions.append(link("Poggit page", item.html_url, "", true));
    }

    const artifact = artifactFor(item);
    if (artifact.url && (artifact.local || archiveUrl(artifact.url) || /^https:\/\/poggit\.pmmp\.io\//.test(artifact.url))) {
      const download = link(artifact.label, artifact.url, artifact.local || archiveUrl(artifact.url) ? "download-link" : "", !artifact.local);
      download.setAttribute("download", "");
      download.setAttribute("aria-label", `${artifact.label} for ${title} ${item.version || ""}`);
      actions.append(download);
    }

    row.append(content, actions);
    return row;
  }

  function filteredRows() {
    const rows = state.kind === "plugins" ? state.releases : state.virions;
    const query = state.query.trim().toLocaleLowerCase();
    const filtered = rows.filter((item) => {
      if (!query) return true;
      const fields = state.kind === "plugins"
        ? [item.name, item.project_name, item.version, item.tagline, item.description, item.repo_name, item.license, item.state_name, ...(item.keywords || []), ...(item.producers?.Collaborator || [])]
        : [item.name, item.owner, item.repo, item.project, item.version, item.namespace, item.source_url];
      return fields.some((value) => String(value || "").toLocaleLowerCase().includes(query));
    });
    if (state.kind === "plugins") {
      return filtered.sort((a, b) => Number(b.downloads || 0) - Number(a.downloads || 0));
    }
    return filtered.sort((a, b) => Number(b.used_by_projects || 0) - Number(a.used_by_projects || 0));
  }

  function render() {
    const filtered = filteredRows();
    const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    state.page = Math.min(state.page, pages);
    const start = (state.page - 1) * PAGE_SIZE;
    const visible = filtered.slice(start, start + PAGE_SIZE);
    results.replaceChildren();

    if (visible.length) {
      visible.forEach((item) => results.append(renderRow(item)));
    } else {
      results.append(element("p", "empty-state", "No entries match this search"));
    }

    const end = Math.min(start + PAGE_SIZE, filtered.length);
    const category = state.kind === "plugins" ? "plugin releases" : "virions";
    $("#results-count").textContent = filtered.length
      ? `Showing ${number(start + 1)}-${number(end)} of ${number(filtered.length)} ${category}`
      : "0 results";
    $("#page-label").textContent = `Page ${state.page} of ${pages}`;
    $("#prev-page").disabled = state.page <= 1;
    $("#next-page").disabled = state.page >= pages;
    results.setAttribute("aria-labelledby", state.kind === "plugins" ? "tab-plugins" : "tab-virions");
  }

  function setKind(kind) {
    state.kind = kind;
    state.page = 1;
    document.querySelectorAll(".tab").forEach((tab) => {
      const active = tab.dataset.kind === kind;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", String(active));
    });
    render();
  }

  async function getJson(url) {
    const response = await fetch(url, { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    return response.json();
  }

  async function optionalJson(url) {
    try {
      return await getJson(url);
    } catch {
      return {};
    }
  }

  async function init() {
    try {
      const pointerUrl = new URL("data/api/v1/current.json", location.href);
      const pointer = await getJson(pointerUrl);
      const base = (relative) => new URL(relative, pointerUrl).href;
      const [summary, releases, virions, pluginDownloads, virionDownloads, sourceDownloads] = await Promise.all([
        getJson(base(pointer.files.summary)),
        getJson(base(pointer.files.releases)),
        getJson(base(pointer.files.virions)),
        optionalJson(base(pointer.files.downloads_plugins)),
        optionalJson(base(pointer.files.downloads_virions)),
        optionalJson(base(pointer.files.source_downloads)),
      ]);

      state.releases = Array.isArray(releases) ? releases : [];
      state.virions = Array.isArray(virions) ? virions : [];
      state.pluginDownloads = pluginDownloads;
      state.virionDownloads = virionDownloads;
      state.sourceDownloads = sourceDownloads;
      $("#plugins-tab-count").textContent = number(summary.counts?.plugin_release_rows);
      $("#virions-tab-count").textContent = number(summary.counts?.virion_entries);
      $("#snapshot-label").textContent = `Snapshot ${snapshotDate(summary.captured_at || pointer.captured_at || summary.snapshot_id || pointer.snapshot_id)}`;
      render();
    } catch (error) {
      const notice = $("#error");
      notice.textContent = `Could not load the saved catalog. ${error.message}. Open this site through a local web server because browser security blocks data files opened directly from disk.`.replace(/[\u2013\u2014]/g, "-");
      notice.classList.remove("hidden");
      $("#results-count").textContent = "Catalog unavailable";
      results.replaceChildren();
    }
  }

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => setKind(tab.dataset.kind));
  });
  $("#search").addEventListener("input", (event) => {
    state.query = event.target.value;
    state.page = 1;
    render();
  });
  $("#prev-page").addEventListener("click", () => {
    state.page -= 1;
    render();
    window.scrollTo({ top: $(".catalog").offsetTop - 24, behavior: "smooth" });
  });
  $("#next-page").addEventListener("click", () => {
    state.page += 1;
    render();
    window.scrollTo({ top: $(".catalog").offsetTop - 24, behavior: "smooth" });
  });
  init();
})();

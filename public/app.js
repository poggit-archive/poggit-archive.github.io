(() => {
  const PAGE_SIZE = 40;
  const state = {
    kind: "plugins",
    page: 1,
    query: "",
    releases: [],
    pluginProjects: [],
    virions: [],
    selectedPluginVersions: new Map(),
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

  function versionDate(value) {
    const parsed = new Date(Number(value) * 1000);
    if (!Number.isFinite(parsed.getTime())) return "Date unknown";
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(parsed);
  }

  function versionOptionLabel(release) {
    return `${release.version || "Version unknown"} (${versionDate(release.submission_date)})`;
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
    return url ? { url, label: "GitHub source" } : null;
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
    return null;
  }

  function addMeta(container, value) {
    if (value === undefined || value === null || value === "") return;
    container.append(element("span", "", value));
  }

  function addPluginMeta(container, item) {
    addMeta(container, `${number(item.downloads)} downloads`);
    addMeta(container, item.state_name);
    addMeta(container, item.license ? `License ${item.license}` : "License unknown");
  }

  function renderActions(item, title) {
    const actions = element("div", "result-actions");
    const source = sourceArtifact(item);
    if (source) actions.append(link(source.label, source.url, "", true));

    const artifact = artifactFor(item);
    if (artifact?.url) {
      const download = link(artifact.label, artifact.url, artifact.local || archiveUrl(artifact.url) ? "download-link" : "", !artifact.local);
      download.setAttribute("download", "");
      download.setAttribute("aria-label", `${artifact.label} for ${title} ${item.version || ""}`);
      actions.append(download);
    } else {
      actions.append(element("span", "result-action-unavailable", "PHAR not archived"));
    }
    return actions;
  }

  function pluginIconUrl(item) {
    if (!item.icon_url) return null;
    try {
      const url = new URL(String(item.icon_url).trim());
      return url.protocol === "https:" && ["github.com", "raw.githubusercontent.com"].includes(url.hostname)
        ? url.href
        : null;
    } catch {
      return null;
    }
  }

  function updatePluginIcon(frame, item) {
    frame.replaceChildren();
    const url = pluginIconUrl(item);
    if (!url) return;
    const image = document.createElement("img");
    image.src = url;
    image.alt = "";
    image.loading = "lazy";
    image.decoding = "async";
    image.referrerPolicy = "no-referrer";
    image.addEventListener("error", () => image.remove(), { once: true });
    frame.append(image);
  }

  function groupPluginReleases(releases) {
    const groups = new Map();
    for (const release of releases) {
      const fallbackName = String(release.project_name || release.name || "").trim().toLocaleLowerCase();
      const fallbackRepo = String(release.repo_id || release.repo_name || "").toLocaleLowerCase();
      const key = release.project_id !== null && release.project_id !== undefined
        ? `project:${release.project_id}`
        : `fallback:${fallbackRepo}:${fallbackName}`;
      if (!groups.has(key)) groups.set(key, { key, releases: [] });
      groups.get(key).releases.push(release);
    }

    return Array.from(groups.values(), (project) => {
      project.releases.sort((a, b) => Number(b.id || 0) - Number(a.id || 0));
      project.title = project.releases[0].name || project.releases[0].project_name || "Unnamed project";
      project.totalDownloads = project.releases.reduce((total, release) => total + Number(release.downloads || 0), 0);
      return project;
    });
  }

  function closeVersionControl(control, restoreFocus = false) {
    const trigger = control.querySelector(".version-trigger");
    const menu = control.querySelector(".version-menu");
    control.classList.remove("is-open");
    trigger.setAttribute("aria-expanded", "false");
    menu.hidden = true;
    if (restoreFocus) trigger.focus();
  }

  function renderVersionControl(project, selected, title, onChange) {
    const control = element("div", "version-control");
    const label = element("span", "version-label", "Version");
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "version-trigger";
    trigger.setAttribute("aria-label", `Version for ${title}: ${versionOptionLabel(selected)}`);
    trigger.setAttribute("aria-expanded", "false");
    const currentVersion = element("span", "version-current", versionOptionLabel(selected));
    const caret = element("span", "version-caret");
    caret.setAttribute("aria-hidden", "true");
    trigger.append(currentVersion, caret);

    const menu = element("div", "version-menu");
    menu.id = `versions-${project.key.replace(/[^\w-]/g, "-")}`;
    menu.setAttribute("role", "group");
    menu.setAttribute("aria-label", `Versions for ${title}`);
    menu.hidden = true;
    trigger.setAttribute("aria-controls", menu.id);

    for (const release of project.releases) {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "version-option";
      option.setAttribute("aria-current", String(String(release.id) === String(selected.id)));
      option.append(
        element("span", "version-option-name", release.version || "Version unknown"),
        element("span", "version-option-date", versionDate(release.submission_date)),
      );
      option.addEventListener("click", () => {
        currentVersion.textContent = versionOptionLabel(release);
        trigger.setAttribute("aria-label", `Version for ${title}: ${versionOptionLabel(release)}`);
        menu.querySelectorAll(".version-option").forEach((entry) => entry.setAttribute("aria-current", "false"));
        option.setAttribute("aria-current", "true");
        closeVersionControl(control);
        onChange(release);
        trigger.focus();
      });
      menu.append(option);
    }

    trigger.addEventListener("click", () => {
      if (control.classList.contains("is-open")) {
        closeVersionControl(control);
        return;
      }
      document.querySelectorAll(".version-control.is-open").forEach((openControl) => closeVersionControl(openControl));
      menu.hidden = false;
      control.classList.add("is-open");
      trigger.setAttribute("aria-expanded", "true");
      const active = menu.querySelector('[aria-current="true"]') || menu.querySelector(".version-option");
      active?.focus();
    });

    control.addEventListener("focusout", (event) => {
      if (!control.contains(event.relatedTarget)) closeVersionControl(control);
    });
    control.append(label, trigger, menu);
    return control;
  }

  function renderRow(entry) {
    const isPlugin = state.kind === "plugins";
    const project = isPlugin ? entry : null;
    const selectedId = project ? state.selectedPluginVersions.get(project.key) : null;
    const item = project
      ? project.releases.find((release) => String(release.id) === selectedId) || project.releases[0]
      : entry;
    const row = element("article", "result-row");
    const icon = isPlugin ? element("span", "result-icon") : null;
    if (icon) {
      row.classList.add("has-icon");
      icon.setAttribute("aria-hidden", "true");
      updatePluginIcon(icon, item);
    }
    const content = element("div", "result-content");
    const title = item.name || item.project_name || "Unnamed project";
    content.append(element("h2", "result-title", title));

    const description = isPlugin
      ? cleanText(item.tagline || item.description || "No description recorded")
      : cleanText(item.namespace || "Virion");
    content.append(element("p", "result-description", description));

    const meta = element("p", "result-meta");
    let releaseMeta = null;
    if (isPlugin && project.releases.length > 1) {
      releaseMeta = element("span", "result-release-meta");
      addPluginMeta(releaseMeta, item);
      meta.append(renderVersionControl(project, item, title, (release) => {
        state.selectedPluginVersions.set(project.key, String(release.id));
        updatePluginIcon(icon, release);
        description.textContent = cleanText(release.tagline || release.description || "No description recorded");
        releaseMeta.replaceChildren();
        addPluginMeta(releaseMeta, release);
        const nextActions = renderActions(release, title);
        actions.replaceWith(nextActions);
        actions = nextActions;
      }));
      meta.append(releaseMeta);
    } else if (isPlugin) {
      addMeta(meta, item.version || "Version unknown");
      addPluginMeta(meta, item);
    } else {
      addMeta(meta, item.version || "Version unknown");
      addMeta(meta, `${number(item.used_by_projects)} projects use this`);
      if (item.last_updated) addMeta(meta, date(Number(item.last_updated)));
    }
    content.append(meta);

    let actions = renderActions(item, title);

    if (icon) row.append(icon);
    row.append(content, actions);
    return row;
  }

  function textMatches(values, query, mode = "contains") {
    return values.some((value) => {
      const text = cleanText(value).toLocaleLowerCase();
      if (mode === "exact") return text === query;
      if (mode === "prefix") return text.startsWith(query);
      return text.includes(query);
    });
  }

  function searchPriority(item, query) {
    if (!query) return 0;

    const isPlugin = state.kind === "plugins";
    const releases = isPlugin ? item.releases : [];
    const names = isPlugin
      ? [item.title, ...releases.flatMap((release) => [release.name, release.project_name])]
      : [item.name, item.project_name];
    if (textMatches(names, query, "exact")) return 0;
    if (textMatches(names, query, "prefix")) return 1;
    if (textMatches(names, query)) return 2;

    const authors = isPlugin
      ? releases.flatMap((release) => [
        ...Object.values(release.producers || {}).flatMap((names) => Array.isArray(names) ? names : [names]),
        String(release.repo_name || "").split("/")[0],
      ])
      : [item.owner, String(item.source_url || "").split("/")[3]];
    if (textMatches(authors, query)) return 3;

    const descriptions = isPlugin
      ? releases.flatMap((release) => [release.tagline, release.description])
      : [item.tagline, item.description, item.namespace];
    return textMatches(descriptions, query) ? 4 : null;
  }

  function filteredRows() {
    const rows = state.kind === "plugins" ? state.pluginProjects : state.virions;
    const query = state.query.trim().toLocaleLowerCase();
    return rows
      .map((item) => ({ item, priority: searchPriority(item, query) }))
      .filter((entry) => entry.priority !== null)
      .sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return state.kind === "plugins"
          ? b.item.totalDownloads - a.item.totalDownloads
          : Number(b.item.used_by_projects || 0) - Number(a.item.used_by_projects || 0);
      })
      .map((entry) => entry.item);
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
    const category = state.kind === "plugins" ? "plugins" : "virions";
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
      state.pluginProjects = groupPluginReleases(state.releases);
      state.virions = Array.isArray(virions) ? virions : [];
      state.pluginDownloads = pluginDownloads;
      state.virionDownloads = virionDownloads;
      state.sourceDownloads = sourceDownloads;
      $("#plugins-tab-count").textContent = number(state.pluginProjects.length);
      $("#virions-tab-count").textContent = number(summary.counts?.virion_entries);
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
  document.addEventListener("click", (event) => {
    document.querySelectorAll(".version-control.is-open").forEach((control) => {
      if (!control.contains(event.target)) closeVersionControl(control);
    });
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const control = document.querySelector(".version-control.is-open");
    if (control) {
      event.preventDefault();
      closeVersionControl(control, true);
    }
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

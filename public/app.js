(() => {
  const PAGE_SIZE = 40;
  const state = {
    kind: "plugins",
    page: 1,
    query: "",
    searchField: "name",
    apiVersion: "",
    releases: [],
    pluginProjects: [],
    virions: [],
    selectedPluginVersions: new Map(),
    pluginDownloads: {},
    virionDownloads: {},
    sourceDownloads: {},
    recoveredSources: {},
    loaded: false,
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

  function compareApiVersions(left, right) {
    const parse = (value) => {
      const match = String(value).match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
      return match ? {
        major: Number(match[1]),
        minor: Number(match[2]),
        patch: Number(match[3]),
        prerelease: match[4] || "",
      } : null;
    };
    const a = parse(left);
    const b = parse(right);
    if (!a || !b) return String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: "base" });
    for (const part of ["major", "minor", "patch"]) {
      if (a[part] !== b[part]) return a[part] - b[part];
    }
    if (a.prerelease === b.prerelease) return 0;
    if (!a.prerelease) return 1;
    if (!b.prerelease) return -1;
    return a.prerelease.localeCompare(b.prerelease, undefined, { numeric: true, sensitivity: "base" });
  }

  function populateApiFilter(releases) {
    const menu = $("#api-filter-menu");
    const versions = new Set();
    for (const release of releases) {
      for (const range of release.api || []) {
        if (range.from) versions.add(String(range.from));
        if (range.to) versions.add(String(range.to));
      }
    }
    Array.from(versions)
      .sort((a, b) => compareApiVersions(b, a))
      .forEach((version) => {
        const option = element("button", "api-filter-option", `API ${version}`);
        option.type = "button";
        option.setAttribute("role", "option");
        option.setAttribute("aria-selected", "false");
        option.tabIndex = -1;
        option.dataset.apiVersion = version;
        menu.append(option);
      });
  }

  function releaseSupportsApi(release, version) {
    return (release.api || []).some((range) => {
      const startsBefore = !range.from || compareApiVersions(version, range.from) >= 0;
      const endsAfter = !range.to || compareApiVersions(version, range.to) <= 0;
      return startsBefore && endsAfter;
    });
  }

  function closeApiFilterMenu(restoreFocus = false) {
    const control = $("#api-filter-control");
    control.classList.remove("is-open");
    $("#api-filter-trigger").setAttribute("aria-expanded", "false");
    $("#api-filter-menu").hidden = true;
    if (restoreFocus) $("#api-filter-trigger").focus();
  }

  function focusApiFilterOption(index) {
    const options = Array.from($("#api-filter-menu").querySelectorAll("[role='option']"));
    if (!options.length) return;
    const target = options[(index + options.length) % options.length];
    options.forEach((option) => { option.tabIndex = option === target ? 0 : -1; });
    target.focus();
    target.scrollIntoView({ block: "nearest" });
  }

  function openApiFilterMenu(index = null) {
    const control = $("#api-filter-control");
    const trigger = $("#api-filter-trigger");
    const menu = $("#api-filter-menu");
    const options = Array.from(menu.querySelectorAll("[role='option']"));
    const selectedIndex = Math.max(0, options.findIndex((option) => option.dataset.apiVersion === state.apiVersion));
    menu.hidden = false;
    control.classList.add("is-open");
    trigger.setAttribute("aria-expanded", "true");
    focusApiFilterOption(index ?? selectedIndex);
  }

  function setApiFilter(version) {
    state.apiVersion = version;
    state.page = 1;
    const label = version ? `API ${version}` : "All APIs";
    $("#api-filter-current").textContent = label;
    $("#api-filter-trigger").setAttribute("aria-label", `Filter by API version: ${label}`);
    $("#api-filter-menu").querySelectorAll("[role='option']").forEach((option) => {
      const selected = option.dataset.apiVersion === version;
      option.setAttribute("aria-selected", String(selected));
      option.tabIndex = selected ? 0 : -1;
    });
    closeApiFilterMenu(true);
    render();
  }

  function cleanText(value) {
    return String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  }

  function cleanDescription(value) {
    const description = cleanText(value)
      .replace(/[#*0-9]\uFE0F?\u20E3/gu, " ")
      .replace(/[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}\uFE0F\u200D\u{E0020}-\u{E007F}]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
    return description || "No description recorded";
  }

  function pluginAuthor(item) {
    const owner = String(item?.repo_name || "").split("/")[0].trim();
    return owner || null;
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

  function archiveUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && url.hostname === "github.com" && url.pathname.startsWith("/poggit-archive/artifacts/releases/download/");
    } catch {
      return false;
    }
  }

  function sourceArtifact(item) {
    if (state.kind !== "plugins" || !item.repo_id || !item.build_commit) return null;
    const key = `${item.repo_id}@${String(item.build_commit).toLowerCase()}`;
    const archived = state.sourceDownloads[key];
    if (archived?.status === "uploaded" && archiveUrl(archived.remote_url)) {
      return { url: archived.remote_url, label: "Archived source" };
    }
    const recovered = state.recoveredSources[String(item.id)];
    return recovered?.status === "uploaded" && recovered.method === "unphar"
      && recovered.complete_git_snapshot === false && archiveUrl(recovered.remote_url)
      ? { url: recovered.remote_url, label: "Source from PHAR", details: "Files recovered from the original PHAR. Repository files excluded during the build may be missing." }
      : null;
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
    const rebuilt = local?.rebuilt_artifact;
    if (rebuilt?.status === "uploaded" && archiveUrl(rebuilt.remote_url)) {
      return { url: rebuilt.remote_url, label: "Rebuilt PHAR", local: false, rebuilt };
    }
    return null;
  }

  function addMeta(container, value) {
    if (value === undefined || value === null || value === "") return;
    container.append(element("span", "", value));
  }

  function addPluginMeta(container, item, totalDownloads = item.downloads) {
    addMeta(container, `${number(totalDownloads)} total downloads`);
    const license = String(item.license || "").trim();
    const source = state.sourceDownloads[`${item.repo_id}@${String(item.build_commit || "").toLowerCase()}`];
    addMeta(container, !license || ["none", "unknown"].includes(license.toLowerCase()) || source?.license_display === "No License"
      ? "No License"
      : `License ${license}`);
  }

  function renderActions(item, title) {
    const actions = element("div", "result-actions");
    const source = sourceArtifact(item);
    if (source) {
      const sourceLink = link(source.label, source.url, "", true);
      if (source.details) {
        sourceLink.title = source.details;
        sourceLink.setAttribute("aria-label", `${source.label} for ${title}. ${source.details}`);
      }
      actions.append(sourceLink);
    }

    const artifact = artifactFor(item);
    if (artifact?.url) {
      const download = link(artifact.label, artifact.url, artifact.local || archiveUrl(artifact.url) ? "download-link" : "", !artifact.local);
      download.setAttribute("download", "");
      download.setAttribute("aria-label", `${artifact.label} for ${title} ${item.version || ""}`);
      if (artifact.rebuilt) {
        const provenance = artifact.rebuilt;
        const source = `${provenance.source_repo || "source"}@${String(provenance.source_commit || "").slice(0, 12)}`;
        const version = provenance.virion_version ? `virion version ${provenance.virion_version}` : "virion version unknown";
        const dependencies = Array.isArray(provenance.dependencies) && provenance.dependencies.length > 0
          ? ` Declared dependencies: ${provenance.dependencies.map((dependency) => `${dependency.src || "virion"} ${dependency.version || ""}`.trim()).join(", ")}.`
          : "";
        const details = `Rebuilt with ${provenance.builder || "VirionTools"} ${provenance.builder_version || ""} from ${source}; ${version}; SHA-256 ${provenance.sha256 || "unavailable"}.${dependencies}`;
        download.title = details;
        download.setAttribute("aria-label", `${artifact.label} for ${title} ${item.version || ""}; ${details}`);
      }
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
    const titleElement = element("h2", "result-title");
    titleElement.append(document.createTextNode(title));
    const author = isPlugin ? element("span", "result-title-author") : null;
    if (author) {
      const name = pluginAuthor(item);
      author.textContent = name ? `by ${name}` : "";
      author.hidden = !name;
      titleElement.append(author);
    }
    content.append(titleElement);

    const description = isPlugin
      ? cleanDescription(item.tagline || item.description)
      : cleanText(item.namespace || "Virion");
    content.append(element("p", "result-description", description));

    const meta = element("div", "result-meta");
    let releaseMeta = null;
    if (isPlugin && project.releases.length > 1) {
      releaseMeta = element("span", "result-release-meta");
      addPluginMeta(releaseMeta, item, project.totalDownloads);
      meta.append(renderVersionControl(project, item, title, (release) => {
        state.selectedPluginVersions.set(project.key, String(release.id));
        updatePluginIcon(icon, release);
        const nextAuthor = pluginAuthor(release);
        author.textContent = nextAuthor ? `by ${nextAuthor}` : "";
        author.hidden = !nextAuthor;
        description.textContent = cleanDescription(release.tagline || release.description);
        releaseMeta.replaceChildren();
        addPluginMeta(releaseMeta, release, project.totalDownloads);
        const nextActions = renderActions(release, title);
        actions.replaceWith(nextActions);
        actions = nextActions;
      }));
      meta.append(releaseMeta);
    } else if (isPlugin) {
      addMeta(meta, item.version || "Version unknown");
      addPluginMeta(meta, item, project.totalDownloads);
    } else {
      addMeta(meta, item.version || "Version unknown");
      addMeta(meta, `${number(item.used_by_projects)} projects use this`);
      if (item.last_updated) addMeta(meta, date(Number(item.last_updated)));
    }
    content.append(meta);

    let actions = renderActions(item, title);
    meta.append(actions);

    if (icon) row.append(icon);
    row.append(content);
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
    const authors = isPlugin
      ? releases.map((release) => String(release.repo_name || "").split("/")[0])
      : [item.owner, String(item.source_url || "").split("/")[3]];
    if (state.searchField === "author") return textMatches(authors, query) ? 0 : null;

    const names = isPlugin
      ? [item.title, ...releases.flatMap((release) => [release.name, release.project_name])]
      : [item.name, item.project_name];
    if (textMatches(names, query, "exact")) return 0;
    if (textMatches(names, query, "prefix")) return 1;
    return textMatches(names, query) ? 2 : null;
  }

  function filteredRows() {
    const rows = state.kind === "plugins" ? state.pluginProjects : state.virions;
    const query = state.query.trim().toLocaleLowerCase();
    return rows
      .map((item) => ({ item, priority: searchPriority(item, query) }))
      .filter((entry) => entry.priority !== null && (!state.apiVersion || state.kind !== "plugins" || entry.item.releases.some((release) => releaseSupportsApi(release, state.apiVersion))))
      .sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return state.kind === "plugins"
          ? b.item.totalDownloads - a.item.totalDownloads
          : Number(b.item.used_by_projects || 0) - Number(a.item.used_by_projects || 0);
      })
      .map((entry) => entry.item);
  }

  function goToPage(page) {
    state.page = page;
    render();
    window.scrollTo({ top: $(".catalog").offsetTop - 24, behavior: "smooth" });
  }

  function renderPagination(pages) {
    const pageList = $("#page-list");
    const pageInput = $("#page-input");
    pageList.replaceChildren();

    const addButton = (label, page, ariaLabel, current = false) => {
      const button = element("button", `page-button${current ? " is-current" : ""}`, label);
      button.type = "button";
      button.disabled = page < 1 || page > pages || page === state.page;
      button.setAttribute("aria-label", ariaLabel);
      if (current) button.setAttribute("aria-current", "page");
      button.addEventListener("click", () => goToPage(page));
      pageList.append(button);
    };

    const addEllipsis = () => pageList.append(element("span", "page-ellipsis", "…"));
    addButton("«", state.page - 1, "Previous page");

    if (pages <= 7) {
      for (let page = 1; page <= pages; page += 1) {
        addButton(String(page), page, `Page ${page}`, page === state.page);
      }
    } else if (state.page <= 4) {
      for (let page = 1; page <= 5; page += 1) {
        addButton(String(page), page, `Page ${page}`, page === state.page);
      }
      addEllipsis();
      addButton(String(pages), pages, `Page ${pages}`);
    } else if (state.page >= pages - 3) {
      addButton("1", 1, "Page 1");
      addEllipsis();
      for (let page = pages - 4; page <= pages; page += 1) {
        addButton(String(page), page, `Page ${page}`, page === state.page);
      }
    } else {
      addButton("1", 1, "Page 1");
      addEllipsis();
      for (let page = state.page - 1; page <= state.page + 1; page += 1) {
        addButton(String(page), page, `Page ${page}`, page === state.page);
      }
      addEllipsis();
      addButton(String(pages), pages, `Page ${pages}`);
    }

    addButton("»", state.page + 1, "Next page");
    pageInput.max = String(pages);
    pageInput.disabled = pages <= 1;
    pageInput.value = "";
  }

  function render() {
    if (!state.loaded) return;
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
    renderPagination(pages);
    results.setAttribute("aria-labelledby", state.kind === "plugins" ? "tab-plugins" : "tab-virions");
  }

  function setKind(kind) {
    state.kind = kind;
    state.page = 1;
    $("#api-filter-control").hidden = kind !== "plugins";
    const nameLabel = kind === "plugins" ? "Plugin" : "Virion";
    $("#search-mode-menu").querySelector('[data-search-field="name"]').textContent = nameLabel;
    if (state.searchField === "name") $("#search-mode-current").textContent = nameLabel;
    document.querySelectorAll(".tab").forEach((tab) => {
      const active = tab.dataset.kind === kind;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", String(active));
    });
    render();
  }

  function closeSearchModeMenu(restoreFocus = false) {
    const control = $("#search-mode-control");
    control.classList.remove("is-open");
    $("#search-mode-trigger").setAttribute("aria-expanded", "false");
    $("#search-mode-menu").hidden = true;
    if (restoreFocus) $("#search-mode-trigger").focus();
  }

  function setSearchField(field) {
    state.searchField = field;
    state.page = 1;
    $("#search-mode-current").textContent = field === "author"
      ? "Author"
      : state.kind === "plugins" ? "Plugin" : "Virion";
    $("#search-mode-menu").querySelectorAll("[data-search-field]").forEach((option) => {
      option.setAttribute("aria-selected", String(option.dataset.searchField === field));
    });
    closeSearchModeMenu(true);
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
      const [summary, releases, virions, pluginDownloads, virionDownloads, sourceDownloads, recoveredSources] = await Promise.all([
        getJson(base(pointer.files.summary)),
        getJson(base(pointer.files.releases)),
        getJson(base(pointer.files.virions)),
        optionalJson(base(pointer.files.downloads_plugins)),
        optionalJson(base(pointer.files.downloads_virions)),
        optionalJson(base(pointer.files.source_downloads)),
        pointer.files.recovered_sources ? optionalJson(base(pointer.files.recovered_sources)) : Promise.resolve({}),
      ]);

      state.releases = Array.isArray(releases) ? releases : [];
      state.pluginProjects = groupPluginReleases(state.releases);
      populateApiFilter(state.releases);
      state.virions = Array.isArray(virions) ? virions : [];
      state.pluginDownloads = pluginDownloads;
      state.virionDownloads = virionDownloads;
      state.sourceDownloads = sourceDownloads;
      state.recoveredSources = recoveredSources;
      $("#plugins-tab-count").textContent = number(state.pluginProjects.length);
      $("#virions-tab-count").textContent = number(summary.counts?.virion_entries);
      state.loaded = true;
      results.setAttribute("aria-busy", "false");
      render();
    } catch (error) {
      const notice = $("#error");
      notice.textContent = `Could not load the saved catalog. ${error.message}. Open this site through a local web server because browser security blocks data files opened directly from disk.`.replace(/[\u2013\u2014]/g, "-");
      notice.classList.remove("hidden");
      $("#results-count").textContent = "Catalog unavailable";
      results.setAttribute("aria-busy", "false");
      results.replaceChildren();
    }
  }

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => setKind(tab.dataset.kind));
  });
  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Node) || !$("#search-mode-control").contains(event.target)) {
      closeSearchModeMenu();
    }
    if (!(event.target instanceof Node) || !$("#api-filter-control").contains(event.target)) {
      closeApiFilterMenu();
    }
    document.querySelectorAll(".version-control.is-open").forEach((control) => {
      if (!control.contains(event.target)) closeVersionControl(control);
    });
  });
  document.addEventListener("keydown", (event) => {
    const searchControl = $("#search-mode-control");
    const searchMenu = $("#search-mode-menu");
    const apiControl = $("#api-filter-control");
    const apiMenu = $("#api-filter-menu");
    if (searchControl.classList.contains("is-open")) {
      const options = Array.from(searchMenu.querySelectorAll("[data-search-field]"));
      const activeIndex = options.indexOf(document.activeElement);
      if (event.key === "Escape") {
        event.preventDefault();
        closeSearchModeMenu(true);
      } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const offset = event.key === "ArrowDown" ? 1 : -1;
        options[(activeIndex + offset + options.length) % options.length]?.focus();
      } else if (event.key === "Home") {
        event.preventDefault();
        options[0]?.focus();
      } else if (event.key === "End") {
        event.preventDefault();
        options.at(-1)?.focus();
      }
    } else if (apiControl.classList.contains("is-open")) {
      const options = Array.from(apiMenu.querySelectorAll("[role='option']"));
      const activeIndex = options.indexOf(document.activeElement);
      if (event.key === "Escape") {
        event.preventDefault();
        closeApiFilterMenu(true);
      } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const offset = event.key === "ArrowDown" ? 1 : -1;
        focusApiFilterOption(activeIndex + offset);
      } else if (event.key === "Home") {
        event.preventDefault();
        focusApiFilterOption(0);
      } else if (event.key === "End") {
        event.preventDefault();
        focusApiFilterOption(options.length - 1);
      }
    } else if (event.target === $("#api-filter-trigger") && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      const lastOption = $("#api-filter-menu").querySelectorAll("[role='option']").length - 1;
      openApiFilterMenu(event.key === "ArrowUp" ? lastOption : null);
    } else if (event.key === "Escape") {
      const control = document.querySelector(".version-control.is-open");
      if (!control) return;
      event.preventDefault();
      closeVersionControl(control, true);
    }
  });
  $("#search").addEventListener("input", (event) => {
    state.query = event.target.value;
    state.page = 1;
    render();
  });
  $("#api-filter-trigger").addEventListener("click", () => {
    if ($("#api-filter-control").classList.contains("is-open")) {
      closeApiFilterMenu();
    } else {
      openApiFilterMenu();
    }
  });
  $("#api-filter-menu").addEventListener("click", (event) => {
    const option = event.target.closest("[data-api-version]");
    if (option) setApiFilter(option.dataset.apiVersion);
  });
  $("#api-filter-control").addEventListener("focusout", (event) => {
    if (!(event.relatedTarget instanceof Node) || !$("#api-filter-control").contains(event.relatedTarget)) {
      closeApiFilterMenu();
    }
  });
  $("#search-mode-trigger").addEventListener("click", () => {
    const control = $("#search-mode-control");
    const trigger = $("#search-mode-trigger");
    const menu = $("#search-mode-menu");
    if (control.classList.contains("is-open")) {
      closeSearchModeMenu();
      return;
    }
    menu.hidden = false;
    control.classList.add("is-open");
    trigger.setAttribute("aria-expanded", "true");
    menu.querySelector('[aria-selected="true"]')?.focus();
  });
  $("#search-mode-menu").querySelectorAll("[data-search-field]").forEach((option) => {
    option.addEventListener("click", () => setSearchField(option.dataset.searchField));
  });
  $("#search-mode-control").addEventListener("focusout", (event) => {
    if (!$("#search-mode-control").contains(event.relatedTarget)) closeSearchModeMenu();
  });
  $("#page-input").addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    const requested = Number(event.currentTarget.value);
    if (!Number.isInteger(requested)) return;
    const pages = Math.max(1, Math.ceil(filteredRows().length / PAGE_SIZE));
    goToPage(Math.min(Math.max(requested, 1), pages));
  });
  init();
})();

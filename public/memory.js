(() => {
  const count = document.querySelector("#memory-count");
  const grid = document.querySelector("#memory-grid");
  const error = document.querySelector("#memory-error");
  const pagination = document.querySelector("#memory-pagination");
  const pageList = document.querySelector("#memory-pages");
  const pageInput = document.querySelector("#memory-page-input");
  const pageSize = 30;
  const number = new Intl.NumberFormat();
  const dateFormatter = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const sheetLoads = new Map();
  let entries = [], currentPage = 1, loaded = false, observer, archiveNote = "";

  function pageFromUrl() {
    const page = Number(new URL(location.href).searchParams.get("page"));
    return Number.isSafeInteger(page) && page > 0 ? page : 1;
  }

  function syncUrl(replace = false) {
    const url = new URL(location.href);
    if (currentPage > 1) url.searchParams.set("page", String(currentPage));
    else url.searchParams.delete("page");
    if (url.href !== location.href) history[replace ? "replaceState" : "pushState"](null, "", url);
  }

  function pageTokens(page, totalPages) {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
    const pages = [...new Set([1, totalPages, page - 1, page, page + 1])].filter((value) => value >= 1 && value <= totalPages).sort((a, b) => a - b);
    const tokens = [];
    pages.forEach((value, index) => {
      if (index && value - pages[index - 1] > 1) tokens.push("...");
      tokens.push(value);
    });
    return tokens;
  }

  function focusHeading() {
    document.querySelector("#memory-title").focus({ preventScroll: true });
    document.querySelector(".memory-page").scrollIntoView({ block: "start" });
  }

  function goToPage(page) {
    if (!loaded) return;
    const next = Math.min(Math.max(1, page), Math.max(1, Math.ceil(entries.length / pageSize)));
    if (next === currentPage) { pageInput.value = ""; return; }
    currentPage = next;
    render();
    syncUrl();
    focusHeading();
  }

  function renderPagination(totalPages) {
    pageList.replaceChildren();
    pagination.classList.toggle("hidden", totalPages <= 1);
    pageInput.disabled = totalPages <= 1;
    pageInput.max = String(totalPages);
    pageInput.value = "";
    if (totalPages <= 1) return;
    const addButton = (label, page, name) => {
      const button = element("button", `page-button${page === currentPage && !name ? " is-current" : ""}`, label);
      button.type = "button";
      button.disabled = Boolean(name && page === currentPage);
      button.setAttribute("aria-label", name || `Page ${page}`);
      button.setAttribute("aria-controls", "memory-grid");
      if (!name && page === currentPage) button.setAttribute("aria-current", "page");
      button.addEventListener("click", () => goToPage(page));
      pageList.append(button);
    };
    addButton("«", 1, "First page");
    addButton("‹", Math.max(1, currentPage - 1), "Previous page");
    for (const token of pageTokens(currentPage, totalPages)) {
      if (token === "...") pageList.append(element("span", "page-ellipsis", "..."));
      else addButton(String(token), token);
    }
    addButton("›", Math.min(totalPages, currentPage + 1), "Next page");
    addButton("»", totalPages, "Last page");
  }

  function render() {
    observer?.disconnect();
    const totalPages = Math.max(1, Math.ceil(entries.length / pageSize));
    currentPage = Math.min(Math.max(1, currentPage), totalPages);
    const start = (currentPage - 1) * pageSize;
    grid.replaceChildren();
    const visible = entries.slice(start, start + pageSize).map(({ release, tile }) => renderCard(release, tile));
    count.textContent = entries.length
      ? `Showing ${number.format(start + 1)}-${number.format(start + visible.length)} of ${number.format(entries.length)} unique archived icons, oldest first.${archiveNote}`
      : "No cached plugin icons found";
    renderPagination(totalPages);
    if ("IntersectionObserver" in window) {
      const entryByCard = new Map(visible.map((entry) => [entry.card, entry]));
      observer = new IntersectionObserver((observations) => {
        for (const observation of observations) {
          if (!observation.isIntersecting) continue;
          showIcon(entryByCard.get(observation.target));
          observer.unobserve(observation.target);
        }
      }, { rootMargin: "240px 0px" });
      for (const entry of visible) observer.observe(entry.card);
    } else visible.forEach(showIcon);
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function submissionTime(release) {
    const value = Number(release.submission_date);
    const date = new Date(value * 1000);
    return Number.isFinite(date.getTime()) ? value : Number.MAX_SAFE_INTEGER;
  }

  function releaseDate(release) {
    const value = submissionTime(release);
    return value === Number.MAX_SAFE_INTEGER
      ? { value, label: "Date unknown" }
      : { value, label: dateFormatter.format(new Date(value * 1000)) };
  }

  function validTile(tile) {
    if (!tile || typeof tile.sheet !== "string" || !Number.isInteger(tile.column) || !Number.isInteger(tile.row)) {
      return false;
    }
    try {
      const url = new URL(tile.sheet, location.origin);
      return url.origin === location.origin && url.pathname.startsWith("/memory-icons/") && url.pathname.endsWith(".webp")
        && tile.column >= 0 && tile.column < 8 && tile.row >= 0 && tile.row < 8;
    } catch {
      return false;
    }
  }

  function renderCard(release, tile) {
    const name = String(release.name || release.project_name || "Unnamed plugin");
    const version = String(release.version || "Version unknown");
    const date = releaseDate(release);
    const card = element("article", "memory-card");
    const frame = element("div", "memory-image-frame");
    frame.setAttribute("aria-hidden", "true");
    frame.style.setProperty("--memory-icon-x", `${(tile.column / 7) * 100}%`);
    frame.style.setProperty("--memory-icon-y", `${(tile.row / 7) * 100}%`);
    const title = element("h3", "memory-name", name);
    title.title = name;
    const authorName = String(release.repo_name || "").split("/")[0].trim();
    const author = authorName ? element("p", "memory-author", `by ${authorName}`) : null;
    if (author) author.title = authorName;
    const details = element("p", "memory-details", version);
    const submitted = element("time", "memory-date", date.label);
    if (date.value !== Number.MAX_SAFE_INTEGER) submitted.dateTime = new Date(date.value * 1000).toISOString();
    card.append(frame, title);
    if (author) card.append(author);
    card.append(details, submitted);
    grid.append(card);
    return { card, frame, sheet: tile.sheet };
  }

  function loadSheet(path) {
    if (!sheetLoads.has(path)) {
      const loading = new Promise((resolvePromise) => {
        const image = new Image();
        image.decoding = "async";
        image.onload = () => resolvePromise(true);
        image.onerror = () => resolvePromise(false);
        image.src = path;
        if (image.complete) resolvePromise(image.naturalWidth > 0);
      });
      sheetLoads.set(path, loading);
    }
    return sheetLoads.get(path);
  }

  async function showIcon(entry) {
    if (!entry) return;
    entry.frame.classList.add("is-loading");
    const available = await loadSheet(entry.sheet);
    if (!entry.card.isConnected) return;
    entry.frame.classList.remove("is-loading");
    entry.frame.classList.add(available ? "is-loaded" : "is-unavailable");
    if (available) entry.frame.style.backgroundImage = `url("${entry.sheet}")`;
  }

  async function init() {
    try {
      const pointerUrl = new URL("/data/api/v1/current.json", location.origin);
      const [pointerResponse, manifestResponse] = await Promise.all([
        fetch(pointerUrl),
        fetch("/memory-icons/manifest.json", { cache: "no-cache" }),
      ]);
      if (!pointerResponse.ok) throw new Error(`Snapshot index returned ${pointerResponse.status}`);
      if (!manifestResponse.ok) throw new Error(`Icon cache returned ${manifestResponse.status}`);

      const [pointer, manifest] = await Promise.all([pointerResponse.json(), manifestResponse.json()]);
      const releasesUrl = new URL(pointer.files.releases, pointerUrl);
      const releasesResponse = await fetch(releasesUrl);
      if (!releasesResponse.ok) throw new Error(`Release data returned ${releasesResponse.status}`);
      const releases = await releasesResponse.json();
      const sorted = (Array.isArray(releases) ? releases : [])
        .map((release) => ({ release, date: submissionTime(release) }))
        .sort((a, b) => a.date - b.date || Number(a.release.id || 0) - Number(b.release.id || 0));
      const seenTiles = new Set();

      for (const { release } of sorted) {
        const tile = manifest.icons?.[String(release.id)];
        if (!validTile(tile)) continue;
        const tileKey = `${tile.sheet}:${tile.column}:${tile.row}`;
        if (seenTiles.has(tileKey)) continue;
        seenTiles.add(tileKey);
        entries.push({ release, tile });
      }

      if (manifest.partial) archiveNote += " Local preview only shows part of the archive.";
      if (manifest.unavailable_sources > 0) {
        archiveNote += ` ${number.format(manifest.unavailable_sources)} unavailable icon sources were skipped.`;
      }
      loaded = true;
      currentPage = pageFromUrl();
      render();
      syncUrl(true);
    } catch (cause) {
      error.textContent = `Could not load archived plugin icons. ${cause.message}.`;
      error.classList.remove("hidden");
      count.textContent = "Icon archive unavailable";
      grid.replaceChildren();
    } finally {
      grid.setAttribute("aria-busy", "false");
    }
  }

  function jumpToInput() {
    if (!pageInput.value.trim()) return;
    const page = Number(pageInput.value);
    if (Number.isSafeInteger(page)) goToPage(page);
  }
  pageInput.addEventListener("change", jumpToInput);
  pageInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); jumpToInput(); }
  });
  window.addEventListener("popstate", () => {
    if (!loaded) return;
    currentPage = pageFromUrl();
    render();
    focusHeading();
  });
  init();
})();

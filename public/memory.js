(() => {
  const count = document.querySelector("#memory-count");
  const grid = document.querySelector("#memory-grid");
  const error = document.querySelector("#memory-error");
  const number = new Intl.NumberFormat();
  const dateFormatter = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const sheetLoads = new Map();

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
    const details = element("p", "memory-details", version);
    const submitted = element("time", "memory-date", date.label);
    if (date.value !== Number.MAX_SAFE_INTEGER) submitted.dateTime = new Date(date.value * 1000).toISOString();
    card.append(frame, title, details, submitted);
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
        fetch("/memory-icons/manifest.json"),
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
      const entries = [];
      const entryByCard = new Map();

      for (const { release } of sorted) {
        const tile = manifest.icons?.[String(release.id)];
        if (!validTile(tile)) continue;
        const tileKey = `${tile.sheet}:${tile.column}:${tile.row}`;
        if (seenTiles.has(tileKey)) continue;
        seenTiles.add(tileKey);
        const entry = renderCard(release, tile);
        entries.push(entry);
        entryByCard.set(entry.card, entry);
      }

      count.textContent = `${number.format(entries.length)} unique archived icons, oldest first.`;
      if (manifest.partial) count.textContent += " Local preview only shows part of the archive.";
      if (manifest.unavailable_sources > 0) {
        count.textContent += ` ${number.format(manifest.unavailable_sources)} unavailable icon sources were skipped.`;
      }
      if (entries.length === 0) {
        count.textContent = "No cached plugin icons found";
        return;
      }

      if ("IntersectionObserver" in window) {
        const observer = new IntersectionObserver((observations) => {
          for (const observation of observations) {
            if (!observation.isIntersecting) continue;
            showIcon(entryByCard.get(observation.target));
            observer.unobserve(observation.target);
          }
        }, { rootMargin: "240px 0px" });
        for (const entry of entries) observer.observe(entry.card);
      } else {
        entries.forEach(showIcon);
      }
    } catch (cause) {
      error.textContent = `Could not load archived plugin icons. ${cause.message}.`;
      error.classList.remove("hidden");
      count.textContent = "Icon archive unavailable";
    }
  }

  init();
})();

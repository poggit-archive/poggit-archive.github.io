(() => {
  const count = document.querySelector("#memory-count");
  const grid = document.querySelector("#memory-grid");
  const error = document.querySelector("#memory-error");
  const number = new Intl.NumberFormat();
  const dateFormatter = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const uniqueImages = new Map();
  const queue = [];
  let activeFetches = 0;
  const maxFetches = 6;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function validIconUrl(value) {
    try {
      const url = new URL(String(value || "").trim());
      return url.protocol === "https:" && ["github.com", "raw.githubusercontent.com"].includes(url.hostname)
        ? url.href
        : null;
    } catch {
      return null;
    }
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

  function renderCard(release, source) {
    const name = String(release.name || release.project_name || "Unnamed plugin");
    const version = String(release.version || "Version unknown");
    const date = releaseDate(release);
    const card = element("article", "memory-card");
    const frame = element("div", "memory-image-frame");
    const image = document.createElement("img");
    image.alt = `${name} ${version} icon`;
    image.decoding = "async";
    frame.append(image);
    const title = element("h3", "memory-name", name);
    title.title = name;
    const details = element("p", "memory-details", version);
    const submitted = element("time", "memory-date", date.label);
    if (date.value !== Number.MAX_SAFE_INTEGER) submitted.dateTime = new Date(date.value * 1000).toISOString();
    card.append(frame, title, details, submitted);
    card.dataset.iconUrl = source;
    card.dataset.submissionDate = String(date.value);
    card.dataset.releaseId = String(release.id || 0);
    grid.append(card);
    return { card, image, source, date: date.value, id: Number(release.id || 0) };
  }

  function removeDuplicate(entry, fingerprint) {
    const existing = uniqueImages.get(fingerprint);
    if (!existing) {
      uniqueImages.set(fingerprint, entry);
      return false;
    }

    const entryIsOlder = entry.date < existing.date || (entry.date === existing.date && entry.id < existing.id);
    if (entryIsOlder) {
      existing.card.remove();
      uniqueImages.set(fingerprint, entry);
    } else {
      entry.card.remove();
    }
    return true;
  }

  async function inspect(entry) {
    try {
      const response = await fetch(entry.source, { mode: "cors", credentials: "omit", referrerPolicy: "no-referrer" });
      if (!response.ok) throw new Error(`Image returned ${response.status}`);
      const imageData = await response.blob();
      const bytes = await imageData.arrayBuffer();
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const fingerprint = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
      if (removeDuplicate(entry, fingerprint)) return;

      const objectUrl = URL.createObjectURL(imageData);
      entry.image.addEventListener("load", () => URL.revokeObjectURL(objectUrl), { once: true });
      entry.image.addEventListener("error", () => {
        URL.revokeObjectURL(objectUrl);
        entry.card.remove();
      }, { once: true });
      entry.image.src = objectUrl;
    } catch {
      entry.image.addEventListener("error", () => entry.card.remove(), { once: true });
      entry.image.src = entry.source;
    }
  }

  function drainQueue() {
    while (activeFetches < maxFetches && queue.length > 0) {
      const entry = queue.shift();
      activeFetches += 1;
      inspect(entry).finally(() => {
        activeFetches -= 1;
        drainQueue();
      });
    }
  }

  function enqueue(entry) {
    if (entry.card.dataset.queued === "true") return;
    entry.card.dataset.queued = "true";
    queue.push(entry);
    drainQueue();
  }

  async function init() {
    try {
      const pointerUrl = new URL("/data/api/v1/current.json", location.origin);
      const pointerResponse = await fetch(pointerUrl);
      if (!pointerResponse.ok) throw new Error(`Snapshot index returned ${pointerResponse.status}`);
      const pointer = await pointerResponse.json();
      const releasesUrl = new URL(pointer.files.releases, pointerUrl);
      const releasesResponse = await fetch(releasesUrl);
      if (!releasesResponse.ok) throw new Error(`Release data returned ${releasesResponse.status}`);
      const releases = await releasesResponse.json();
      const sorted = (Array.isArray(releases) ? releases : [])
        .filter((release) => validIconUrl(release.icon_url))
        .map((release) => ({ release, date: submissionTime(release) }))
        .sort((a, b) => a.date - b.date || Number(a.release.id || 0) - Number(b.release.id || 0));
      const seenUrls = new Set();
      const entries = [];
      const entryByCard = new Map();
      for (const { release } of sorted) {
        const source = validIconUrl(release.icon_url);
        if (!source || seenUrls.has(source)) continue;
        seenUrls.add(source);
        const entry = renderCard(release, source);
        entries.push(entry);
        entryByCard.set(entry.card, entry);
      }

      count.textContent = `${number.format(sorted.length)} plugin releases have icon data. Repeated icon files appear once.`;
      if (entries.length === 0) {
        count.textContent = "No archived plugin icons found";
        return;
      }

      if ("IntersectionObserver" in window) {
        const observer = new IntersectionObserver((observations) => {
          for (const observation of observations) {
            if (!observation.isIntersecting) continue;
            const entry = entryByCard.get(observation.target);
            if (entry) enqueue(entry);
            observer.unobserve(observation.target);
          }
        }, { rootMargin: "320px 0px" });
        for (const entry of entries) observer.observe(entry.card);
      } else {
        entries.forEach(enqueue);
      }
    } catch (cause) {
      error.textContent = `Could not load archived plugin icons. ${cause.message}.`;
      error.classList.remove("hidden");
      count.textContent = "Icon archive unavailable";
    }
  }

  init();
})();

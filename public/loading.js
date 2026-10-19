(() => {
  const root = document.documentElement;
  const trackedImages = new WeakMap();
  let placeholder, safetyTimer;
  const bars = (count, type = "loading-line") => Array.from({ length: count }, () => `<span class="skeleton-block ${type}"></span>`).join("");
  const lines = () => `<div class="loading-lines">${bars(4)}</div>`;
  const cards = () => `<div class="loading-cards">${Array.from({ length: 20 }, () => `<div><span class="skeleton-block loading-square"></span>${bars(2)}</div>`).join("")}</div>`;

  function pageKind(path) {
    if (/^\/plugins\/[^/]+\/(?:\d+\/)?$/.test(path) || /^\/virions\/[^/]+\/[^/]+\/[^/]+\/$/.test(path)) return "plugin";
    return ({ "/": "catalog", "/leaderboard/": "leaderboard", "/memory/": "memory", "/preservation/": "document" })[path];
  }

  function shell(kind) {
    const heading = `<div class="loading-heading">${kind === "plugin" ? '<span class="skeleton-block loading-icon"></span>' : ""}<div>${bars(1, "loading-title")}${bars(2)}</div></div>`;
    const toolbar = `<div class="loading-toolbar">${bars(3, "loading-control")}</div>`;
    if (kind === "memory") return heading + cards();
    if (kind === "catalog") return toolbar + Array.from({ length: 5 }, () => `<div class="loading-row"><span class="skeleton-block loading-icon"></span>${lines()}</div>`).join("");
    if (kind === "leaderboard") return heading + toolbar + Array.from({ length: 8 }, () => `<div class="loading-table-row">${bars(5)}</div>`).join("");
    if (kind === "plugin") return heading + toolbar + `<div class="loading-columns"><div>${toolbar}${lines()}<span class="skeleton-block loading-feature"></span>${lines()}</div><aside>${bars(1, "loading-card")}${bars(1, "loading-card")}</aside></div>`;
    return heading + lines() + toolbar + lines() + lines();
  }

  function finishPage() {
    clearTimeout(safetyTimer);
    root.classList.remove("page-loading", "page-navigating");
    placeholder?.parentElement?.removeAttribute("aria-busy");
    placeholder?.remove();
    placeholder = null;
  }

  function startPage(kind, navigating = false) {
    const main = document.querySelector("main");
    if (!main || !kind) return;
    placeholder?.remove();
    placeholder = document.createElement("div");
    placeholder.className = "page-skeleton";
    placeholder.setAttribute("role", "status");
    placeholder.innerHTML = `<span class="sr-only">Loading page…</span><div aria-hidden="true">${shell(kind)}</div>`;
    main.prepend(placeholder);
    main.setAttribute("aria-busy", "true");
    root.classList.add("page-loading");
    if (navigating) {
      root.style.setProperty("--loading-top", `${Math.max(0, document.querySelector(".site-header")?.getBoundingClientRect().bottom || 0)}px`);
      root.classList.add("page-navigating");
    }
    clearTimeout(safetyTimer);
    // Recover if a navigation is cancelled or another script fails to finish.
    safetyTimer = setTimeout(finishPage, 15000);
  }

  function images(container) {
    const candidates = container.matches?.("img[src]") ? [container] : [...container.querySelectorAll?.("img[src]") || []];
    for (const image of candidates) {
      const source = image.getAttribute("src");
      const previous = trackedImages.get(image);
      if (previous?.source === source) continue;
      previous?.cleanup();
      const finish = () => {
        image.classList.remove("image-loading");
        image.removeAttribute("aria-busy");
      };
      const cleanup = () => {
        finish();
        image.removeEventListener("load", finish);
        image.removeEventListener("error", finish);
      };
      trackedImages.set(image, { source, cleanup });
      if (image.complete) { finish(); continue; }
      image.classList.add("image-loading");
      image.setAttribute("aria-busy", "true");
      image.addEventListener("load", finish, { once: true });
      image.addEventListener("error", finish, { once: true });
    }
  }

  function panel(container, label) {
    const skeleton = document.createElement("div");
    skeleton.className = "panel-skeleton";
    skeleton.setAttribute("role", "status");
    const status = document.createElement("span");
    status.className = "sr-only";
    status.textContent = label;
    const shapes = document.createElement("div");
    shapes.setAttribute("aria-hidden", "true");
    shapes.innerHTML = lines();
    skeleton.append(status, shapes);
    container.replaceChildren(skeleton);
  }

  window.ArchiveLoading = { images, panel };
  const kind = pageKind(location.pathname);
  if (document.readyState === "loading" && kind) root.classList.add("page-loading");
  const observer = new MutationObserver((changes) => {
    if (!placeholder && root.classList.contains("page-loading")) startPage(kind);
    for (const change of changes) {
      if (change.type === "attributes") images(change.target);
      else for (const node of change.addedNodes) if (node.nodeType === Node.ELEMENT_NODE) images(node);
    }
  });
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["src"] });
  document.addEventListener("DOMContentLoaded", () => { finishPage(); images(document); }, { once: true });
  window.addEventListener("pageshow", (event) => { if (event.persisted) finishPage(); });
  window.addEventListener("pagehide", finishPage);
  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest?.("a[href]");
    if (!link || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search)) return;
    startPage(pageKind(url.pathname), true);
  });
})();

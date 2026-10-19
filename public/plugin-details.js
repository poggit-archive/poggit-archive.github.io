(() => {
  const groups = [];

  function tabGroup(list, tabs, panels, initialIndex = 0, onSelect = () => {}) {
    list.setAttribute("role", "tablist");
    const select = (index, focus = false) => {
      tabs.forEach((tab, position) => {
        const selected = position === index;
        tab.setAttribute("aria-selected", String(selected));
        tab.tabIndex = selected ? 0 : -1;
        panels[position].hidden = !selected;
      });
      onSelect(index);
      if (focus) {
        tabs[index].focus({ preventScroll: true });
        tabs[index].scrollIntoView({ block: "nearest", inline: "nearest" });
      }
    };
    tabs.forEach((tab, index) => {
      const panel = panels[index];
      tab.id = `${panel.id}-tab`;
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-controls", panel.id);
      panel.setAttribute("role", "tabpanel");
      panel.setAttribute("aria-labelledby", tab.id);
      panel.tabIndex = 0;
      const activate = () => {
        select(index);
        const hash = `#${encodeURIComponent(panel.id)}`;
        if (location.hash !== hash) history.pushState(null, "", hash);
        revealHash();
      };
      tab.addEventListener("click", (event) => {
        if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        activate();
      });
      tab.addEventListener("keydown", (event) => {
        if (event.key === " ") { event.preventDefault(); tab.click(); return; }
        const vertical = list.getAttribute("aria-orientation") === "vertical";
        const next = { [vertical ? "ArrowDown" : "ArrowRight"]: (index + 1) % tabs.length, [vertical ? "ArrowUp" : "ArrowLeft"]: (index + tabs.length - 1) % tabs.length, Home: 0, End: tabs.length - 1 }[event.key];
        if (next === undefined) return;
        event.preventDefault();
        tabs[next].click();
        select(next, true);
      });
    });
    select(initialIndex);
    groups.push({ panels, select, initialIndex });
  }

  // GitHub's rendered headings can be wrapped in a div with an empty permalink.
  // Keep those wrappers and their IDs intact when moving a section into a panel.
  function sectionHeading(node, selector = "h1, h2") {
    if (node.nodeType !== Node.ELEMENT_NODE) return null;
    if (node.matches(selector)) return node;
    if (node.matches("div") && node.firstElementChild?.matches(selector) &&
        [...node.childNodes].every((child) => child === node.firstElementChild || !child.textContent.trim())) return node.firstElementChild;
    return null;
  }

  function descriptionTabs(document) {
    const nodes = [...document.childNodes];
    const headings = nodes.map((node) => sectionHeading(node)).filter((heading) => heading?.textContent.trim());
    const level = headings.some((heading) => heading.tagName === "H2") ? "H2" : "H1";
    const sections = [{ label: "General", nodes: [] }];
    for (const node of nodes) {
      const heading = sectionHeading(node);
      if (heading?.tagName === level && heading.textContent.trim()) sections.push({ label: heading.textContent.trim(), nodes: [] });
      sections.at(-1).nodes.push(node);
    }
    // Whitespace and line breaks before the first heading do not need a tab.
    const hasContent = (node) => node.textContent.trim() || (node.nodeType === Node.ELEMENT_NODE && (node.matches("img, hr") || node.querySelector("img, hr")));
    if (sections.length > 1 && !sections[0].nodes.some(hasContent)) {
      const introduction = sections.shift();
      sections[0].nodes.unshift(...introduction.nodes);
    }
    if (sections.length < 2) return;
    const list = window.document.createElement("nav");
    list.className = "document-tabs";
    list.setAttribute("aria-label", "Description sections");
    const tabs = [], panels = [];
    sections.forEach((section, index) => {
      const panel = window.document.createElement("div");
      panel.id = `description-panel-${index}`;
      panel.className = "document-panel";
      panel.append(...section.nodes);
      const tab = window.document.createElement("a");
      tab.href = `#${panel.id}`;
      tab.textContent = section.label;
      list.append(tab);
      document.append(panel);
      tabs.push(tab);
      panels.push(panel);
    });
    document.prepend(list);
    tabGroup(list, tabs, panels);
    panels.forEach(descriptionSubtabs);
  }

  function descriptionSubtabs(parent) {
    const introduction = [], sections = [];
    for (const node of [...parent.childNodes]) {
      const heading = sectionHeading(node, "h3");
      if (heading?.textContent.trim()) sections.push({ label: heading.textContent.trim(), nodes: [] });
      (sections.at(-1)?.nodes || introduction).push(node);
    }
    if (sections.length < 2) return;
    const layout = document.createElement("div");
    layout.className = "document-subsections";
    const list = document.createElement("nav");
    list.className = "document-tabs document-subtabs";
    const parentTab = document.getElementById(parent.getAttribute("aria-labelledby"));
    list.setAttribute("aria-label", `${parentTab.textContent} subsections`);
    const content = document.createElement("div");
    content.className = "document-subpanels";
    const tabs = [], panels = [];
    sections.forEach((section, index) => {
      const panel = document.createElement("div");
      panel.id = `${parent.id}-subsection-${index}`;
      panel.className = "document-subpanel";
      panel.append(...section.nodes);
      const tab = document.createElement("a");
      tab.href = `#${panel.id}`;
      tab.textContent = section.label;
      list.append(tab);
      content.append(panel);
      tabs.push(tab);
      panels.push(panel);
    });
    layout.append(list, content);
    parent.replaceChildren(...introduction, layout);
    const narrow = window.matchMedia("(max-width: 900px)");
    const orientation = () => list.setAttribute("aria-orientation", narrow.matches ? "horizontal" : "vertical");
    orientation();
    narrow.addEventListener("change", orientation);
    tabGroup(list, tabs, panels);
  }

  function changelogTabs() {
    const section = document.querySelector("#changelog");
    const versions = [...document.querySelectorAll(".detail-version-menu a")];
    if (!section || versions.length < 2) return;
    const current = Math.max(0, versions.findIndex((version) => version.getAttribute("aria-current") === "page"));
    const content = [...section.childNodes];
    const list = document.createElement("nav");
    list.className = "document-tabs";
    list.setAttribute("aria-label", "Changelog versions");
    const tabs = [], panels = [], loaded = new Set([current]), loading = new Set();
    versions.forEach((version, index) => {
      const tab = document.createElement("a");
      tab.href = `${version.getAttribute("href")}#changelog`;
      tab.textContent = version.querySelector("strong").textContent;
      const panel = document.createElement("div");
      panel.id = `changelog-release-${new URL(version.href).pathname.split("/").filter(Boolean).at(-1)}`;
      if (index === current) panel.append(...content);
      tabs.push(tab);
      panels.push(panel);
    });
    list.append(...tabs);
    section.append(list, ...panels);
    tabGroup(list, tabs, panels, current, async (index) => {
      if (loaded.has(index) || loading.has(index)) return;
      const panel = panels[index];
      loading.add(index);
      panel.setAttribute("aria-busy", "true");
      if (window.ArchiveLoading) window.ArchiveLoading.panel(panel, "Loading preserved changelog…");
      else panel.textContent = "Loading preserved changelog…";
      try {
        // Read an existing local static page; no Poggit or GitHub request is needed.
        const url = new URL(tabs[index].href);
        if (url.origin !== location.origin || !url.pathname.startsWith("/plugins/")) throw new Error("Invalid changelog URL");
        const response = await fetch(url.pathname, { signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error("Changelog page unavailable");
        const page = new DOMParser().parseFromString(await response.text(), "text/html");
        const changelog = page.querySelector("#changelog");
        if (!changelog) throw new Error("Changelog section unavailable");
        // Different versions can reuse the same heading IDs. Scope imported IDs
        // to this panel so section links still identify one unique element.
        const ids = new Map();
        changelog.querySelectorAll("[id]").forEach((element) => {
          const id = element.id;
          element.id = `${panel.id}-${id}`;
          ids.set(id, element.id);
        });
        changelog.querySelectorAll('a[href^="#"]').forEach((link) => {
          let id;
          try { id = decodeURIComponent(link.hash.slice(1)); } catch { return; }
          if (ids.has(id)) link.setAttribute("href", `#${encodeURIComponent(ids.get(id))}`);
        });
        panel.replaceChildren(...[...changelog.childNodes].map((node) => document.importNode(node, true)));
        imageFallbacks(panel);
        loaded.add(index);
        if (decodeURIComponent(location.hash.slice(1)).startsWith(`${panel.id}-`)) revealHash(true);
      } catch {
        const fallback = document.createElement("a");
        fallback.href = tabs[index].href;
        fallback.textContent = "Open this version’s page";
        panel.replaceChildren("This changelog could not be loaded. ", fallback);
      } finally {
        loading.delete(index);
        panel.removeAttribute("aria-busy");
      }
    });
  }

  const main = document.querySelector(".detail-main");
  const navigation = document.querySelector(".detail-tabs");
  if (main && navigation) {
    const panels = [...main.children].filter((section) => section.matches(".detail-section[id]"));
    const tabs = panels.map((panel) => {
      const existing = navigation.querySelector(`a[href="#${panel.id}"]`);
      const tab = existing || document.createElement("a");
      tab.href = `#${panel.id}`;
      if (!existing) tab.textContent = panel.querySelector("h2").childNodes[0].textContent.trim();
      return tab;
    });
    navigation.replaceChildren(...tabs);
    main.prepend(navigation);
    tabGroup(navigation, tabs, panels);
    const description = document.querySelector("#overview .archived-document");
    if (description) descriptionTabs(description);
    changelogTabs();
  }

  function revealHash(scroll = false) {
    let id;
    try { id = decodeURIComponent(location.hash.slice(1)); }
    catch { return; }
    // A heading in another version is available only after its panel is loaded.
    const target = document.getElementById(id) || [...document.querySelectorAll('#changelog > [role="tabpanel"]')].find((panel) => id.startsWith(`${panel.id}-`));
    if (!target) return;
    for (const group of groups) {
      const index = group.panels.findIndex((panel) => panel === target || panel.contains(target));
      if (index !== -1) group.select(index);
      else if (target.contains(group.panels[0])) group.select(group.initialIndex);
    }
    for (let parent = target.parentElement; parent; parent = parent.parentElement) {
      if (parent.matches("details")) parent.open = true;
    }
    if (scroll) target.scrollIntoView({ block: "start" });
  }
  revealHash(Boolean(location.hash));
  window.addEventListener("hashchange", () => revealHash(true));

  // Failed images use local placeholders, never an upstream fallback.
  function imageFallbacks(root) {
    root.querySelectorAll(".archived-document img").forEach((image) => {
      const placeholder = () => { image.src = "/assets/image-unavailable.svg"; image.alt = "Image unavailable"; };
      image.addEventListener("error", placeholder, { once: true });
      if (image.complete && !image.naturalWidth) placeholder();
    });
  }
  imageFallbacks(document);
  document.addEventListener("archive-document-ready", (event) => {
    if (!event.target.matches(".archived-document")) return;
    if (event.target.closest("#overview")) descriptionTabs(event.target);
    imageFallbacks(event.target);
    revealHash(Boolean(location.hash));
  });
  const iconFallback = document.querySelector("[data-virion-id]") ? "/assets/virion.svg" : "/assets/plugin.svg";
  document.querySelectorAll(".detail-icon").forEach((image) => {
    const placeholder = () => { image.src = iconFallback; image.title = "Default icon; image unavailable."; };
    image.addEventListener("error", placeholder, { once: true });
    if (image.complete && !image.naturalWidth) placeholder();
  });
  const picker = document.querySelector(".detail-version-picker");
  let versionApisReady = false, versionApisLoading = false;
  async function loadVersionApis() {
    if (!picker?.open || versionApisReady || versionApisLoading) return;
    versionApisLoading = true;
    const entries = [...picker.querySelectorAll(".detail-version-menu a")].map((link) => {
      let line = link.querySelector(".version-menu-api");
      if (!line) { line = document.createElement("span"); line.className = "version-menu-api"; link.append(line); }
      line.classList.add("skeleton-block");
      line.removeAttribute("title");
      line.setAttribute("aria-busy", "true");
      line.textContent = "Loading API…";
      return { link, line };
    });
    try {
      const response = await fetch("/plugin-documents/apis.json.gz", { cache: "no-cache", signal: AbortSignal.timeout(10000) });
      if (!response.ok || !response.body) throw new Error("API metadata unavailable");
      const payload = await new Response(response.body.pipeThrough(new DecompressionStream("gzip"))).json();
      if (payload.schema_version !== 1 || !payload.apis || typeof payload.apis !== "object") throw new Error("Invalid API metadata");
      for (const { link, line } of entries) {
        const id = new URL(link.href, location.href).pathname.match(/\/(\d+)\/$/)?.[1];
        const label = typeof payload.apis[id] === "string" ? payload.apis[id] : "API not recorded";
        line.textContent = label;
        link.setAttribute("aria-label", `${link.getAttribute("aria-label")}, ${label}`);
      }
      versionApisReady = true;
    } catch {
      for (const { line } of entries) { line.textContent = "API unavailable"; line.title = "API metadata could not load. Open the version page to view its recorded APIs."; }
    } finally {
      for (const { line } of entries) { line.classList.remove("skeleton-block"); line.removeAttribute("aria-busy"); }
      versionApisLoading = false;
    }
  }
  picker?.addEventListener("toggle", loadVersionApis);
  if (picker?.open) loadVersionApis();
  picker?.addEventListener("keydown", (event) => { if (event.key === "Escape") { picker.open = false; picker.querySelector("summary")?.focus(); } });
  document.addEventListener("click", (event) => { if (picker && !picker.contains(event.target)) picker.open = false; });
})();

(() => {
  const key = "poggit-archive:theme";
  const root = document.documentElement;
  const system = window.matchMedia("(prefers-color-scheme: dark)");
  const valid = (value) => ["light", "dark", "system"].includes(value);
  const read = () => {
    try { const value = localStorage.getItem(key); return valid(value) ? value : "system"; }
    catch { return "system"; }
  };
  const icons = {
    light: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
    dark: '<path d="M20.8 13A9 9 0 0 1 11 3.2 9 9 0 1 0 20.8 13Z"/>',
    system: '<rect x="3" y="4" width="18" height="13" rx="1"/><path d="M8 21h8m-4-4v4"/>',
  };
  const labels = { light: "Light", dark: "Dark", system: "System" };
  const icon = (path) => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
  const chevron = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>';
  let preference = read();
  let controls;

  // Run in the head before styles and content to avoid a light flash on navigation.
  function apply() {
    const theme = preference === "system" ? (system.matches ? "dark" : "light") : preference;
    root.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#141414" : "#ffffff");
    const trigger = controls?.querySelector(".theme-control-trigger");
    if (trigger) {
      trigger.setAttribute("aria-label", `Color theme: ${labels[preference]}`);
      trigger.title = `Color theme: ${labels[preference]}`;
      trigger.innerHTML = `${icon(icons[preference])}${chevron}`;
    }
    for (const button of controls?.querySelectorAll("[data-theme-choice]") || []) {
      button.setAttribute("aria-checked", String(button.dataset.themeChoice === preference));
    }
  }

  function mount() {
    const header = document.querySelector(".site-header");
    if (!header) return;
    controls = document.createElement("div");
    controls.className = "theme-control";
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "theme-control-trigger";
    trigger.setAttribute("aria-label", `Color theme: ${labels[preference]}`);
    trigger.setAttribute("aria-haspopup", "menu");
    trigger.setAttribute("aria-expanded", "false");
    trigger.title = `Color theme: ${labels[preference]}`;
    trigger.innerHTML = `${icon(icons[preference])}${chevron}`;

    const menu = document.createElement("div");
    menu.className = "theme-control-menu";
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", "Choose color theme");
    menu.hidden = true;

    const closeMenu = (restoreFocus = false) => {
      menu.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
      if (restoreFocus) trigger.focus();
    };
    const openMenu = () => {
      menu.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
      menu.querySelector('[aria-checked="true"]')?.focus();
    };

    trigger.addEventListener("click", () => {
      if (menu.hidden) openMenu();
      else closeMenu();
    });
    trigger.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        openMenu();
      }
    });

    for (const mode of ["light", "dark", "system"]) {
      const label = labels[mode];
      const button = document.createElement("button");
      button.type = "button";
      button.className = "theme-control-option";
      button.dataset.themeChoice = mode;
      button.setAttribute("role", "menuitemradio");
      button.setAttribute("aria-checked", "false");
      button.setAttribute("aria-label", label);
      button.innerHTML = `<span class="theme-control-option-icon">${icon(icons[mode])}</span><span>${label}</span><span class="theme-control-check" aria-hidden="true"><svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m3 8 3.2 3.2L13 4.5"/></svg></span>`;
      button.addEventListener("click", () => {
        preference = mode;
        try { localStorage.setItem(key, mode); } catch { /* Theme still works when storage is blocked. */ }
        apply();
        closeMenu(true);
      });
      menu.append(button);
    }
    menu.addEventListener("keydown", (event) => {
      const options = [...menu.querySelectorAll("[data-theme-choice]")];
      const current = options.indexOf(document.activeElement);
      let next = current;
      if (event.key === "ArrowDown") next = (current + 1) % options.length;
      else if (event.key === "ArrowUp") next = (current - 1 + options.length) % options.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = options.length - 1;
      else if (event.key === "Escape") {
        event.preventDefault();
        closeMenu(true);
        return;
      } else return;
      event.preventDefault();
      options[next]?.focus();
    });
    document.addEventListener("click", (event) => {
      if (!controls.contains(event.target)) closeMenu();
    });
    controls.append(trigger, menu);
    header.append(controls);
    apply();
  }

  apply();
  system.addEventListener("change", () => { if (preference === "system") apply(); });
  window.addEventListener("storage", (event) => {
    if (event.key === key || event.key === null) { preference = read(); apply(); }
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) { preference = read(); apply(); }
  });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
  else mount();
})();

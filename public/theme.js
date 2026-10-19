(() => {
  const key = "poggit-archive:theme";
  const root = document.documentElement;
  const system = window.matchMedia("(prefers-color-scheme: dark)");
  const valid = (value) => ["light", "dark", "system"].includes(value);
  const read = () => {
    try { const value = localStorage.getItem(key); return valid(value) ? value : "system"; }
    catch { return "system"; }
  };
  let preference = read();
  let controls;

  // Run in the head before styles and content to avoid a light flash on navigation.
  function apply() {
    const theme = preference === "system" ? (system.matches ? "dark" : "light") : preference;
    root.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#141414" : "#ffffff");
    for (const button of controls?.querySelectorAll("button") || []) {
      button.setAttribute("aria-pressed", String(button.dataset.themeChoice === preference));
    }
  }

  function mount() {
    const header = document.querySelector(".site-header");
    if (!header) return;
    controls = document.createElement("div");
    controls.className = "theme-control";
    controls.setAttribute("role", "group");
    controls.setAttribute("aria-label", "Color theme");
    const icons = {
      light: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
      dark: '<path d="M20.8 13A9 9 0 0 1 11 3.2 9 9 0 1 0 20.8 13Z"/>',
      system: '<rect x="3" y="4" width="18" height="13" rx="1"/><path d="M8 21h8m-4-4v4"/>',
    };
    for (const [mode, label] of [["light", "Light theme"], ["dark", "Dark theme"], ["system", "Use system theme"]]) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.themeChoice = mode;
      button.setAttribute("aria-label", label);
      button.title = label;
      button.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[mode]}</svg>`;
      button.addEventListener("click", () => {
        preference = mode;
        try { localStorage.setItem(key, mode); } catch { /* Theme still works when storage is blocked. */ }
        apply();
      });
      controls.append(button);
    }
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

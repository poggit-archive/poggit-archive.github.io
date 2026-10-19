import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

const source = readFileSync(new URL("../public/theme.js", import.meta.url), "utf8");
const key = "poggit-archive:theme";

function harness({ stored = null, dark = false, blocked = false } = {}) {
  const events = new Map();
  const listen = (name, fn) => events.set(name, fn);
  const document = {
    activeElement: null,
    documentElement: null,
    readyState: "loading",
    addEventListener: listen,
    querySelector: (selector) => selector === ".site-header" ? header : meta,
  };
  const element = () => ({
    dataset: {}, attributes: {}, children: [], listeners: {}, hidden: false,
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener(name, fn) { this.listeners[name] = fn; },
    append(...children) { this.children.push(...children); },
    querySelectorAll(selector) {
      const descendants = [];
      const visit = (node) => {
        for (const child of node.children) { descendants.push(child); visit(child); }
      };
      visit(this);
      if (selector === "[data-theme-choice]") return descendants.filter((node) => node.dataset.themeChoice);
      if (selector === '[aria-checked="true"]') return descendants.filter((node) => node.attributes["aria-checked"] === "true");
      return descendants;
    },
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
    contains(target) { return target === this || this.querySelectorAll("*").includes(target); },
    focus() { document.activeElement = this; },
    click() { this.listeners.click?.({ target: this }); },
  });
  document.createElement = element;
  const root = element(), header = element(), meta = element();
  document.documentElement = root;
  const system = { matches: dark, addEventListener(name, fn) { this.change = fn; } };
  const storage = {
    value: stored,
    getItem(name) { assert.equal(name, key); if (blocked) throw new Error("Blocked"); return this.value; },
    setItem(name, value) { assert.equal(name, key); if (blocked) throw new Error("Blocked"); this.value = value; },
  };
  vm.runInNewContext(source, {
    document,
    window: { matchMedia: () => system, addEventListener: listen },
    localStorage: storage,
  });
  const control = () => header.children[0];
  const trigger = () => control().children[0];
  const menu = () => control().children[1];
  const options = () => menu().children;
  return { root, header, meta, storage, system, events, control, trigger, menu, options,
    activeElement() { return document.activeElement; },
    mount() { events.get("DOMContentLoaded")(); },
    choose(mode) { options().find((button) => button.dataset.themeChoice === mode).click(); },
    selected() { return options().filter((button) => button.attributes["aria-checked"] === "true").map((button) => button.dataset.themeChoice); },
  };
}

test("Saved theme applies in the head before the header exists", () => {
  const page = harness({ stored: "dark", dark: false });
  assert.equal(page.root.dataset.theme, "dark");
  assert.equal(page.meta.attributes.content, "#141414");
  assert.equal(page.header.children.length, 0);
  page.mount();
  assert.deepEqual(page.selected(), ["dark"]);
  assert.equal(page.trigger().attributes["aria-label"], "Color theme: Dark");
  assert.ok(page.trigger().innerHTML.includes("M20.8 13"));
});

test("System preference follows live changes; explicit choices override the device", () => {
  const page = harness({ dark: true });
  page.mount();
  assert.deepEqual(page.selected(), ["system"]);
  assert.ok(page.trigger().innerHTML.includes("<rect"));
  assert.equal(page.root.dataset.theme, "dark");
  page.system.matches = false;
  page.system.change();
  assert.equal(page.root.dataset.theme, "light");
  page.choose("dark");
  assert.equal(page.storage.value, "dark");
  assert.equal(page.trigger().attributes["aria-label"], "Color theme: Dark");
  assert.ok(page.trigger().innerHTML.includes("M20.8 13"));
  page.system.change();
  assert.equal(page.root.dataset.theme, "dark");
  page.choose("light");
  assert.equal(page.trigger().attributes["aria-label"], "Color theme: Light");
  assert.ok(page.trigger().innerHTML.includes("M12 2v2"));
  page.system.matches = true;
  page.system.change();
  assert.equal(page.root.dataset.theme, "light");
  page.choose("system");
  assert.equal(page.root.dataset.theme, "dark");
  assert.equal(page.storage.value, "system");
  assert.equal(page.trigger().attributes["aria-label"], "Color theme: System");
  assert.ok(page.trigger().innerHTML.includes("<rect"));
});

test("Blocked or invalid storage keeps the theme usable", () => {
  for (const options of [{ stored: "invalid", dark: true }, { blocked: true, dark: true }]) {
    const page = harness(options);
    page.mount();
    assert.equal(page.root.dataset.theme, "dark");
    assert.deepEqual(page.selected(), ["system"]);
    page.choose("light");
    assert.equal(page.root.dataset.theme, "light");
    assert.equal(page.meta.attributes.content, "#ffffff");
    assert.deepEqual(page.selected(), ["light"]);
  }
});

test("Theme menu opens on the saved mode and closes with Escape", () => {
  const page = harness({ stored: "dark" });
  page.mount();
  page.trigger().click();
  assert.equal(page.menu().hidden, false);
  assert.equal(page.trigger().attributes["aria-expanded"], "true");
  assert.equal(page.activeElement(), page.options()[1]);
  page.menu().listeners.keydown({ key: "ArrowDown", preventDefault() {} });
  assert.equal(page.activeElement(), page.options()[2]);
  page.menu().listeners.keydown({ key: "Escape", preventDefault() {} });
  assert.equal(page.menu().hidden, true);
  assert.equal(page.trigger().attributes["aria-expanded"], "false");
  assert.equal(page.activeElement(), page.trigger());
});

test("Tabs, cleared storage and history restores synchronize the saved preference", () => {
  const page = harness({ stored: "light", dark: true });
  page.mount();
  page.storage.value = "dark";
  page.events.get("storage")({ key: "unrelated" });
  assert.equal(page.root.dataset.theme, "light");
  page.events.get("storage")({ key });
  assert.equal(page.root.dataset.theme, "dark");
  assert.deepEqual(page.selected(), ["dark"]);
  page.storage.value = null;
  page.events.get("storage")({ key: null });
  assert.deepEqual(page.selected(), ["system"]);
  page.storage.value = "light";
  page.events.get("pageshow")({ persisted: true });
  assert.equal(page.root.dataset.theme, "light");
  assert.deepEqual(page.selected(), ["light"]);
});

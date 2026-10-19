import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

const source = readFileSync(new URL("../public/theme.js", import.meta.url), "utf8");
const key = "poggit-archive:theme";

function harness({ stored = null, dark = false, blocked = false } = {}) {
  const events = new Map();
  const listen = (name, fn) => events.set(name, fn);
  const element = () => ({
    dataset: {}, attributes: {}, children: [],
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener(name, fn) { this[name] = fn; },
    append(child) { this.children.push(child); },
    querySelectorAll() { return this.children; },
  });
  const root = element(), header = element(), meta = element();
  const system = { matches: dark, addEventListener(name, fn) { this.change = fn; } };
  const storage = {
    value: stored,
    getItem(name) { assert.equal(name, key); if (blocked) throw new Error("Blocked"); return this.value; },
    setItem(name, value) { assert.equal(name, key); if (blocked) throw new Error("Blocked"); this.value = value; },
  };
  vm.runInNewContext(source, {
    document: {
      documentElement: root, readyState: "loading", addEventListener: listen,
      querySelector: (selector) => selector === ".site-header" ? header : meta,
      createElement: element,
    },
    window: { matchMedia: () => system, addEventListener: listen },
    localStorage: storage,
  });
  return { root, header, meta, storage, system, events,
    mount() { events.get("DOMContentLoaded")(); },
    choose(mode) { header.children[0].children.find((button) => button.dataset.themeChoice === mode).click(); },
    selected() { return header.children[0].children.filter((button) => button.attributes["aria-pressed"] === "true").map((button) => button.dataset.themeChoice); },
  };
}

test("Saved theme applies in the head before the header exists", () => {
  const page = harness({ stored: "dark", dark: false });
  assert.equal(page.root.dataset.theme, "dark");
  assert.equal(page.meta.attributes.content, "#141414");
  assert.equal(page.header.children.length, 0);
  page.mount();
  assert.deepEqual(page.selected(), ["dark"]);
  assert.equal(page.header.children[0].attributes["aria-label"], "Color theme");
});

test("System preference follows live changes; explicit choices override the device", () => {
  const page = harness({ dark: true });
  page.mount();
  assert.deepEqual(page.selected(), ["system"]);
  assert.equal(page.root.dataset.theme, "dark");
  page.system.matches = false;
  page.system.change();
  assert.equal(page.root.dataset.theme, "light");
  page.choose("dark");
  assert.equal(page.storage.value, "dark");
  page.system.change();
  assert.equal(page.root.dataset.theme, "dark");
  page.choose("light");
  page.system.matches = true;
  page.system.change();
  assert.equal(page.root.dataset.theme, "light");
  page.choose("system");
  assert.equal(page.root.dataset.theme, "dark");
  assert.equal(page.storage.value, "system");
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

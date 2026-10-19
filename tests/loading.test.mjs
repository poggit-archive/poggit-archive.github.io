import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

class Element {
  constructor(tag = "div") {
    this.tag = tag;
    this.nodeType = 1;
    this.attributes = new Map();
    this.children = [];
    this.events = new Map();
    this.classes = new Set();
    this.classList = { add: (...names) => names.forEach((name) => this.classes.add(name)), remove: (...names) => names.forEach((name) => this.classes.delete(name)), contains: (name) => this.classes.has(name) };
    this.style = { setProperty() {} };
  }
  setAttribute(name, value) { this.attributes.set(name, value); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  hasAttribute(name) { return this.attributes.has(name); }
  removeAttribute(name) { this.attributes.delete(name); }
  addEventListener(name, fn) { if (!this.events.has(name)) this.events.set(name, new Set()); this.events.get(name).add(fn); }
  removeEventListener(name, fn) { this.events.get(name)?.delete(fn); }
  fire(name, event = {}) { for (const fn of this.events.get(name) || []) fn(event); }
  append(...nodes) { for (const node of nodes) { node.parentElement = this; this.children.push(node); } }
  prepend(node) { node.parentElement = this; this.children.unshift(node); }
  remove() { this.parentElement.children = this.parentElement.children.filter((node) => node !== this); this.parentElement = null; }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  matches() { return this.tag === "img" && this.hasAttribute("src"); }
  querySelectorAll() { return this.children.filter((node) => node.matches()); }
}

function harness() {
  const root = new Element(), main = new Element(), document = new Element(), window = new Element();
  document.documentElement = root;
  document.readyState = "loading";
  document.querySelector = (selector) => selector === "main" ? main : { getBoundingClientRect: () => ({ bottom: 72 }) };
  document.createElement = (tag) => new Element(tag);
  const timers = new Map();
  let mutation;
  const context = vm.createContext({ document, window, location: new URL("https://archive.test/"), URL, Node: { ELEMENT_NODE: 1 }, MutationObserver: class { constructor(fn) { mutation = fn; } observe() {} }, setTimeout: (fn) => { const id = Symbol(); timers.set(id, fn); return id; }, clearTimeout: (id) => timers.delete(id) });
  vm.runInContext(readFileSync(new URL("../public/loading.js", import.meta.url), "utf8"), context);
  const click = (path, options = {}) => {
    const link = new Element("a");
    link.href = new URL(path, "https://archive.test/").href;
    link.target = options.target || "";
    if (options.download) link.setAttribute("download", "file.phar");
    document.fire("click", { button: 0, target: { closest: () => link }, ...options });
  };
  return { root, main, document, window, timers, click, mutate: (changes = []) => mutation(changes) };
}

test("Initial loading reveals static content at DOM ready without waiting for images", () => {
  const page = harness();
  page.mutate();
  assert.equal(page.main.getAttribute("aria-busy"), "true");
  assert.equal(page.main.children[0].getAttribute("role"), "status");
  page.document.fire("DOMContentLoaded");
  assert.equal(page.main.children.length, 0);
  assert.equal(page.root.classList.contains("page-loading"), false);
  assert.equal(page.main.hasAttribute("aria-busy"), false);
});

test("Navigation respects downloads, external links, section tabs and modified clicks", () => {
  const page = harness();
  page.document.fire("DOMContentLoaded");
  for (const [path, options] of [["/#overview", {}], ["/archive-files/file.phar", {}], ["https://outside.test/", {}], ["/plugins/420-multiworld/", { download: true }], ["/plugins/420-multiworld/", { target: "_blank" }], ["/memory/", { ctrlKey: true }], ["/memory/", { defaultPrevented: true }], ["/memory/", { button: 1 }]]) {
    page.click(path, options);
    assert.equal(page.root.classList.contains("page-loading"), false, path);
  }
  page.click("/plugins/420-multiworld/12098/#changelog");
  assert.equal(page.root.classList.contains("page-navigating"), true);
  page.window.fire("pagehide");
  assert.equal(page.main.children.length, 0);
  page.click("/memory/");
  page.window.fire("pageshow", { persisted: true });
  assert.equal(page.root.classList.contains("page-loading"), false);
  page.click("/leaderboard/");
  for (const timer of page.timers.values()) timer();
  assert.equal(page.root.classList.contains("page-loading"), false);
});

test("Image loading settles on success or error, skips cache hits, and restarts for a new source", () => {
  const page = harness();
  const image = new Element("img");
  image.setAttribute("src", "/one.png");
  image.complete = false;
  page.window.ArchiveLoading.images(image);
  assert.equal(image.getAttribute("aria-busy"), "true");
  image.fire("load");
  assert.equal(image.classList.contains("image-loading"), false);
  image.setAttribute("src", "/two.png");
  page.mutate([{ type: "attributes", target: image }]);
  assert.equal(image.classList.contains("image-loading"), true);
  image.fire("error");
  assert.equal(image.hasAttribute("aria-busy"), false);
  image.complete = true;
  image.setAttribute("src", "/cached.png");
  page.window.ArchiveLoading.images(image);
  assert.equal(image.classList.contains("image-loading"), false);
});

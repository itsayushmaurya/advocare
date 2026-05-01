const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function createButton() {
  const classes = new Set();
  return {
    attributes: {},
    classList: {
      add(name) {
        classes.add(name);
      },
      remove(name) {
        classes.delete(name);
      },
      toggle(name, force) {
        if (force) {
          classes.add(name);
        } else {
          classes.delete(name);
        }
      },
      contains(name) {
        return classes.has(name);
      },
    },
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
  };
}

function createContext(storedValues = {}) {
  const elements = {
    charCount: { style: {}, textContent: "" },
    quickToggle: createButton(),
    detailToggle: createButton(),
    langEnToggle: createButton(),
    langHiToggle: createButton(),
    userInput: { addEventListener() {}, focus() {}, value: "" },
  };
  const store = { ...storedValues };
  const context = {
    atob(value) {
      return Buffer.from(value, "base64").toString("binary");
    },
    console,
    document: {
      addEventListener() {},
      getElementById(id) {
        return elements[id] || null;
      },
      removeEventListener() {},
    },
    localStorage: {
      getItem(key) {
        return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
      },
      removeItem(key) {
        delete store[key];
      },
      setItem(key, value) {
        store[key] = String(value);
      },
    },
    window: {
      addEventListener() {},
      location: { href: "" },
    },
  };

  vm.createContext(context);
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "app.js"), "utf8"),
    context,
  );

  return { context, elements, store };
}

{
  const { context, elements, store } = createContext();
  context.setReplyMode("quick");

  assert.equal(vm.runInContext("replyMode", context), "quick");
  assert.equal(store.replyMode, "quick");
  assert.equal(elements.quickToggle.classList.contains("active"), true);
  assert.equal(elements.detailToggle.classList.contains("active"), false);
  assert.equal(elements.quickToggle.attributes["aria-pressed"], "true");
  assert.equal(elements.detailToggle.attributes["aria-pressed"], "false");
}

{
  const { context, elements, store } = createContext();
  context.setLanguage("hi");

  assert.equal(vm.runInContext("language", context), "hi");
  assert.equal(store.language, "hi");
  assert.equal(elements.langHiToggle.classList.contains("active"), true);
  assert.equal(elements.langEnToggle.classList.contains("active"), false);
  assert.equal(elements.langHiToggle.attributes["aria-pressed"], "true");
  assert.equal(elements.langEnToggle.attributes["aria-pressed"], "false");
}

{
  const { context, elements } = createContext({
    language: "hi",
    replyMode: "quick",
  });

  context.updateReplyToggle();
  context.updateLanguageToggle();

  assert.equal(vm.runInContext("replyMode", context), "quick");
  assert.equal(vm.runInContext("language", context), "hi");
  assert.equal(elements.quickToggle.classList.contains("active"), true);
  assert.equal(elements.langHiToggle.classList.contains("active"), true);
}

console.log("Toggle tests passed");

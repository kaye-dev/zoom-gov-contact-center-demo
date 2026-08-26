import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  readStoredLocale,
  storeLocale,
  syncLanguageFromStorage,
} from "../app/i18n/language-store";

const originalLocalStorage = Object.getOwnPropertyDescriptor(
  globalThis,
  "localStorage",
);
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");

afterEach(() => {
  restoreGlobal("localStorage", originalLocalStorage);
  restoreGlobal("document", originalDocument);
});

test("stored available locale synchronizes the explicit HTML language", () => {
  const storage = installBrowserState("en");

  assert.equal(readStoredLocale(["ja", "en"]), "en");
  assert.equal(syncLanguageFromStorage(["ja", "en"]), "en");
  assert.equal(document.documentElement.lang, "en-US");
  assert.equal(storage.value, "en");
});

test("disabled stored locale is normalized to Japanese before reveal", () => {
  const storage = installBrowserState("zh-Hans");

  assert.equal(syncLanguageFromStorage(["ja", "en"]), "ja");
  assert.equal(document.documentElement.lang, "ja-JP");
  assert.equal(storage.value, "ja");
});

test("unavailable localStorage falls back without preventing HTML sync", () => {
  installThrowingBrowserState();

  assert.equal(readStoredLocale(["ja", "en"]), "ja");
  assert.equal(syncLanguageFromStorage(["ja", "en"]), "ja");
  assert.equal(document.documentElement.lang, "ja-JP");
  assert.equal(storeLocale("en"), false);
});

function installBrowserState(initialValue: string | null) {
  const state = { value: initialValue };
  const storage = {
    getItem: () => state.value,
    setItem: (_key: string, value: string) => {
      state.value = value;
    },
  };

  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
  installDocument();

  return state;
}

function installThrowingBrowserState() {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: () => {
        throw new Error("storage unavailable");
      },
      setItem: () => {
        throw new Error("storage unavailable");
      },
    },
  });
  installDocument();
}

function installDocument() {
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { documentElement: { lang: "ja-JP" } },
  });
}

function restoreGlobal(
  key: "localStorage" | "document",
  descriptor: PropertyDescriptor | undefined,
) {
  if (descriptor) {
    Object.defineProperty(globalThis, key, descriptor);
  } else {
    Reflect.deleteProperty(globalThis, key);
  }
}

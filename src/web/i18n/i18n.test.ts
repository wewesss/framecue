import { describe, expect, test } from "bun:test";
import { detectLang, dictionaries, interpolate, isLang, richParts, translate } from "./core";
import { en } from "./en";
import { fr } from "./fr";

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const tags = (text: string) => [...text.matchAll(/<(k|c|n)>/g)].map((m) => m[1]).sort();

describe("dictionaries", () => {
  test("fr and en have exactly the same keys", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(fr).sort());
  });

  test("no empty value", () => {
    for (const lang of ["fr", "en"] as const) {
      for (const [key, value] of Object.entries(dictionaries[lang])) {
        expect(value.trim().length > 0, `${lang}:${key}`).toBe(true);
      }
    }
  });

  test("placeholders and markup tags match between languages", () => {
    for (const key of Object.keys(fr) as (keyof typeof fr)[]) {
      expect(placeholders(en[key]), key).toEqual(placeholders(fr[key]));
      expect(tags(en[key]), key).toEqual(tags(fr[key]));
    }
  });
});

describe("language detection", () => {
  test("fr* maps to fr, everything else to en", () => {
    expect(detectLang("fr")).toBe("fr");
    expect(detectLang("fr-CA")).toBe("fr");
    expect(detectLang("FR-be")).toBe("fr");
    expect(detectLang("en-US")).toBe("en");
    expect(detectLang("de")).toBe("en");
    expect(detectLang(undefined)).toBe("en");
    expect(detectLang("")).toBe("en");
  });

  test("isLang", () => {
    expect(isLang("fr")).toBe(true);
    expect(isLang("en")).toBe(true);
    expect(isLang("es")).toBe(false);
    expect(isLang(null)).toBe(false);
  });
});

describe("interpolate and translate", () => {
  test("fills known variables and keeps unknown ones", () => {
    expect(interpolate("{n} im.", { n: 3 })).toBe("3 im.");
    expect(interpolate("{a}-{b}", { a: 1 })).toBe("1-{b}");
    expect(interpolate("plain")).toBe("plain");
  });

  test("translate uses the requested dictionary", () => {
    expect(translate("fr", "unit.frames", { n: 12 })).toBe("12 im.");
    expect(translate("en", "unit.frames", { n: 12 })).toBe("12 fr.");
    expect(translate("fr", "status.todo")).toBe("À faire");
  });
});

describe("richParts", () => {
  test("splits kbd, code and number tags", () => {
    expect(richParts("a <k>I</k> b <c>x</c> <n>2</n>")).toEqual([
      { tag: null, text: "a " },
      { tag: "k", text: "I" },
      { tag: null, text: " b " },
      { tag: "c", text: "x" },
      { tag: null, text: " " },
      { tag: "n", text: "2" },
    ]);
  });

  test("keeps unknown angle brackets as text", () => {
    expect(richParts("frames/<id>/x")).toEqual([{ tag: null, text: "frames/<id>/x" }]);
  });
});

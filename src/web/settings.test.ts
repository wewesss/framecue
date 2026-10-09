import { describe, expect, test } from "bun:test";
import { parseNav } from "./settings";
import { parseThemeMode, resolveTheme } from "./theme";

describe("settings persistence", () => {
  test("keyboard navigation defaults to off", () => {
    expect(parseNav(null)).toBe(false);
    expect(parseNav(undefined)).toBe(false);
    expect(parseNav("garbage")).toBe(false);
    expect(parseNav("off")).toBe(false);
    expect(parseNav("on")).toBe(true);
  });

  test("theme mode defaults to system and keeps legacy values", () => {
    expect(parseThemeMode(null)).toBe("system");
    expect(parseThemeMode("system")).toBe("system");
    expect(parseThemeMode("garbage")).toBe("system");
    expect(parseThemeMode("dark")).toBe("dark");
    expect(parseThemeMode("light")).toBe("light");
  });

  test("system mode follows the media query, explicit modes ignore it", () => {
    expect(resolveTheme("system", true)).toBe("light");
    expect(resolveTheme("system", false)).toBe("dark");
    expect(resolveTheme("dark", true)).toBe("dark");
    expect(resolveTheme("light", false)).toBe("light");
  });
});

import { en } from "./en";
import { fr, type TKey } from "./fr";

export type { TKey };
export type Lang = "fr" | "en";
export type Vars = Record<string, string | number>;
export type RichTag = "k" | "c" | "n";

export interface RichPart {
  tag: RichTag | null;
  text: string;
}

export const LANGS: readonly Lang[] = ["fr", "en"];

export const dictionaries: Record<Lang, Record<TKey, string>> = { fr, en };

export function isLang(value: unknown): value is Lang {
  return value === "fr" || value === "en";
}

export function detectLang(language: string | null | undefined): Lang {
  return language?.toLowerCase().startsWith("fr") ? "fr" : "en";
}

export function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

export function translate(lang: Lang, key: TKey, vars?: Vars): string {
  return interpolate(dictionaries[lang][key], vars);
}

export function richParts(text: string): RichPart[] {
  const parts: RichPart[] = [];
  const pattern = /<(k|c|n)>(.*?)<\/\1>/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) parts.push({ tag: null, text: text.slice(last, index) });
    parts.push({ tag: match[1] as RichTag, text: match[2] ?? "" });
    last = index + match[0].length;
  }
  if (last < text.length) parts.push({ tag: null, text: text.slice(last) });
  return parts;
}

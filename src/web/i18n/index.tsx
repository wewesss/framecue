import {
  createContext,
  Fragment,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Kbd } from "../ui/Kbd";
import { detectLang, isLang, type Lang, richParts, type TKey, translate, type Vars } from "./core";

export type { Lang, TKey, Vars } from "./core";

export type TFunction = (key: TKey, vars?: Vars) => string;

interface I18n {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: TFunction;
}

const STORAGE_KEY = "framecue-lang";

const Context = createContext<I18n | null>(null);

function readStored(): Lang | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isLang(value) ? value : null;
  } catch {
    return null;
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => readStored() ?? detectLang(navigator.language));

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      return;
    }
  }, []);

  const value = useMemo<I18n>(
    () => ({ lang, setLang, t: (key, vars) => translate(lang, key, vars) }),
    [lang, setLang],
  );

  return <Context value={value}>{children}</Context>;
}

export function useI18n(): I18n {
  const value = useContext(Context);
  if (!value) throw new Error("useI18n needs an I18nProvider");
  return value;
}

export function useT(): TFunction {
  return useI18n().t;
}

interface RichProps {
  id: TKey;
  vars?: Vars;
}

export function Rich({ id, vars }: RichProps) {
  const t = useT();
  return (
    <>
      {richParts(t(id, vars)).map((part, index) => {
        const key = `${index}-${part.text}`;
        if (part.tag === "k") return <Kbd key={key}>{part.text}</Kbd>;
        if (part.tag === "c") return <code key={key}>{part.text}</code>;
        if (part.tag === "n") {
          return (
            <span key={key} className="num">
              {part.text}
            </span>
          );
        }
        return <Fragment key={key}>{part.text}</Fragment>;
      })}
    </>
  );
}

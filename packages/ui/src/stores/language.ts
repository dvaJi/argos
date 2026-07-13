import { Store } from "@tanstack/store";
import { useSelector, shallow } from "@tanstack/react-store";

export const languageStore = new Store({
  language: "en-US",
  dir: "ltr" as "auto" | "rtl" | "ltr",
});

export const initLanguage = async () => {
  languageStore.setState((s) => ({ ...s, language: "en-US", dir: "ltr" }));
};

export const updateLanguage = async (_newLanguage: string) => {
  languageStore.setState((s) => ({ ...s, language: "en-US", dir: "ltr" }));
};

export function useLanguageStore() {
  return useSelector(languageStore, (s) => s, { compare: shallow });
}

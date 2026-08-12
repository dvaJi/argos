import { useMemo } from "react";
import { useThemeStore } from "#/stores/theme";

/**
 * Shared `@pierre/diffs` base options (theme + themeType) driven by the app
 * theme store. Keeps DiffsCodePane / DiffsPatchPane / inline diff sections in
 * sync with light/dark mode and the Pierre theme pair.
 */
export function useDiffsBaseOptions() {
  const themeStore = useThemeStore();
  return useMemo(
    () => ({
      theme: { dark: "pierre-dark", light: "pierre-light" } as const,
      themeType: (themeStore.isDark ? "dark" : "light") as "dark" | "light",
    }),
    [themeStore.isDark],
  );
}

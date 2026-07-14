import { useEffect } from "react";
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { useStore } from "@tanstack/react-store";
import { Toaster } from "sonner";
import { useFontManager } from "../composables/useFontManager";
import { useDeviceVersion } from "../composables/useDeviceVersion";
import { themeStore, type ThemeMode } from "../stores/theme";
import { uiSettingsStore, getFontSizeClass } from "../stores/uiSettingsStore";
import { modelCheckStore } from "../stores/modelCheck";
import ModelCheckDialog from "../components/settings/ModelCheckDialog";
import DaemonConnectionBanner from "../components/DaemonConnectionBanner";

const resolveThemeName = (themeMode: ThemeMode, isDark: boolean) => {
  return themeMode === "system" ? (isDark ? "dark" : "light") : themeMode;
};

const syncAppearanceClasses = (themeName: string, fontSizeClass: string) => {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  root.classList.add("dc-theme-switching");

  for (const target of [root, document.body]) {
    target.classList.remove("light", "dark", "system");
    target.classList.add(themeName);
    target.classList.remove("text-xs", "text-sm", "text-base", "text-lg", "text-xl", "text-2xl");
    target.classList.add(fontSizeClass);
  }

  void root.offsetWidth;
  requestAnimationFrame(() => {
    root.classList.remove("dc-theme-switching");
  });
};

function RootComponent() {
  useFontManager();
  const { isWinMacOS } = useDeviceVersion();

  const themeState = useStore(themeStore);
  const uiSettingsState = useStore(uiSettingsStore);
  const modelCheckState = useStore(modelCheckStore);

  const toasterTheme =
    themeState.themeMode === "system" ? (themeState.isDark ? "dark" : "light") : themeState.themeMode;
  const modelCheckOpen = modelCheckState.isDialogOpen;

  useEffect(() => {
    syncAppearanceClasses(
      resolveThemeName(themeState.themeMode, themeState.isDark),
      getFontSizeClass(uiSettingsState.fontSizeLevel),
    );
  }, [themeState.themeMode, themeState.isDark, uiSettingsState.fontSizeLevel]);

  useEffect(() => {
    document.documentElement.dir = "ltr";
  }, []);

  return (
    <div
      data-testid="app-root"
      className={`flex flex-col h-screen ${isWinMacOS ? "bg-window-background" : "bg-background"}`}
    >
      <DaemonConnectionBanner />
      <Outlet />
      <Toaster theme={toasterTheme as "light" | "dark" | "system"} />
      <ModelCheckDialog
        open={modelCheckOpen}
        providerId={modelCheckState.currentProviderId}
        onOpenChange={(open) => {
          if (!open) modelCheckStore.setState((s) => ({ ...s, isDialogOpen: false }));
        }}
      />
    </div>
  );
}

function RootErrorComponent({ error }: { error: Error }) {
  return (
    <div className="flex h-screen items-center justify-center bg-background px-6 text-foreground">
      <div className="max-w-lg space-y-2 rounded-lg border border-border bg-card p-6 shadow-sm">
        <div className="text-sm font-semibold">Application error</div>
        <p className="text-sm text-muted-foreground">{error.message}</p>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  component: RootComponent,
  errorComponent: RootErrorComponent,
});

import { useState, useEffect, useMemo, useCallback } from "react";
import { Icon } from "@iconify/react";
import { Button } from "@shadcn/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shadcn/components/ui/select";
import { Switch } from "@shadcn/components/ui/switch";
import { ButtonGroup } from "@shadcn/components/ui/button-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@shadcn/components/ui/dialog";
import { FLOATING_BUTTON_AVAILABLE } from "@shared/featureFlags";
import {
  useUiSettingsStore,
  updateFontSizeLevel,
  setContentProtectionEnabled as updateContentProtection,
  setNotificationsEnabled as updateNotifications,
} from "@/stores/uiSettingsStore";
import { useLanguageStore, updateLanguage } from "@/stores/language";
import { useFloatingButtonStore, setFloatingButtonEnabled } from "@/stores/floatingButton";
import { useThemeStore, type ThemeMode } from "@/stores/theme";
import FontSettingsSection from "./display/FontSettingsSection";
import SettingsPageShell from "./control-center/SettingsPageShell";

type ThemePreviewMode = Exclude<ThemeMode, "system">;

const themePreviewStyles: Record<
  ThemePreviewMode,
  {
    window: string;
    toolbar: string;
    sidebar: string;
    content: string;
    accent: string;
    muted: string;
    text: string;
  }
> = {
  light: {
    window: "border-slate-200/80 bg-gradient-to-b from-white via-slate-50 to-slate-100",
    toolbar: "border-slate-200/80 bg-white/90",
    sidebar: "border-slate-200/80 bg-white/90",
    content: "bg-slate-50/80",
    accent: "bg-blue-500/70",
    muted: "bg-slate-200/80",
    text: "bg-slate-300/80",
  },
  dark: {
    window: "border-slate-800/70 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-800",
    toolbar: "border-slate-800/80 bg-slate-900/90",
    sidebar: "border-slate-800/80 bg-slate-900/70",
    content: "bg-slate-900/70",
    accent: "bg-sky-400/70",
    muted: "bg-slate-700/70",
    text: "bg-slate-600/70",
  },
};

const languageOptions = [
  { value: "system", label: "System" },
  { value: "zh-CN", label: "简体中文" },
  { value: "en-US", label: "English (US)" },
  { value: "zh-TW", label: "繁體中文（台灣）" },
  { value: "zh-HK", label: "繁體中文（香港）" },
  { value: "ko-KR", label: "한국어" },
  { value: "ru-RU", label: "Русский" },
  { value: "ja-JP", label: "日本語" },
  { value: "fr-FR", label: "Français" },
  { value: "fa-IR", label: "فارسی (ایران)" },
  { value: "pt-BR", label: "Português (Brasil)" },
  { value: "da-DK", label: "Dansk" },
  { value: "he-IL", label: "עברית (ישראל)" },
  { value: "es-ES", label: "Español (España)" },
  { value: "de-DE", label: "Deutsch (Deutschland)" },
  { value: "tr-TR", label: "Türkçe" },
  { value: "id-ID", label: "Bahasa Indonesia" },
  { value: "ms-MY", label: "Bahasa Melayu" },
  { value: "it-IT", label: "Italiano" },
  { value: "pl-PL", label: "Polski" },
  { value: "vi-VN", label: "Tiếng Việt" },
];

const fontSizeOptions = ["text-sm", "text-base", "text-lg", "text-xl", "text-2xl"];
const fontSizeLabels = ["Small", "Default", "Large", "Extra Large", "Extra Extra Large"];

export default function DisplaySettings() {
  const languageStore = useLanguageStore();
  const uiSettingsStore = useUiSettingsStore();
  const floatingButtonStore = useFloatingButtonStore();
  const themeStore = useThemeStore();

  const [selectedLanguage, setSelectedLanguage] = useState("system");
  const [isUpdatingTheme, setIsUpdatingTheme] = useState(false);
  const [fontSizeLevel, setFontSizeLevel] = useState(() => uiSettingsStore.fontSizeLevel);
  const [isContentProtectionDialogOpen, setIsContentProtectionDialogOpen] = useState(false);
  const [newContentProtectionValue, setNewContentProtectionValue] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => uiSettingsStore.notificationsEnabled);
  const [contentProtectionEnabled, setContentProtectionEnabled] = useState(
    () => uiSettingsStore.contentProtectionEnabled,
  );

  const themeMode = themeStore.themeMode;
  const dir = languageStore.dir;

  const themeOptions = useMemo(
    () => [
      { value: "light" as ThemeMode, label: "Light" },
      { value: "dark" as ThemeMode, label: "Dark" },
      { value: "system" as ThemeMode, label: "System" },
    ],
    [],
  );

  const selectThemeMode = useCallback(
    async (mode: ThemeMode) => {
      if (themeMode === mode || isUpdatingTheme) return;
      setIsUpdatingTheme(true);
      try {
        await themeStore.setThemeMode(mode);
      } catch (error) {
        console.error("Failed to update theme mode", error);
      } finally {
        setIsUpdatingTheme(false);
      }
    },
    [themeMode, isUpdatingTheme, themeStore],
  );

  const handleContentProtectionChange = useCallback((value: boolean) => {
    setNewContentProtectionValue(value);
    setIsContentProtectionDialogOpen(true);
  }, []);

  const cancelContentProtectionChange = useCallback(() => {
    setIsContentProtectionDialogOpen(false);
  }, []);

  const confirmContentProtectionChange = useCallback(() => {
    updateContentProtection(newContentProtectionValue);
    setContentProtectionEnabled(newContentProtectionValue);
    setIsContentProtectionDialogOpen(false);
  }, [newContentProtectionValue]);

  useEffect(() => {
    setSelectedLanguage(languageStore.language);
  }, [languageStore.language]);

  useEffect(() => {
    const update = async () => {
      await updateLanguage(selectedLanguage);
    };
    if (selectedLanguage !== languageStore.language) {
      void update();
    }
  }, [selectedLanguage, languageStore.language]);

  useEffect(() => {
    updateFontSizeLevel(fontSizeLevel);
  }, [fontSizeLevel]);

  const handleNotificationsChange = useCallback((value: boolean) => {
    updateNotifications(value);
    setNotificationsEnabled(value);
  }, []);

  const handleFloatingButtonChange = useCallback(
    (value: boolean) => setFloatingButtonEnabled(value),
    [floatingButtonStore],
  );

  return (
    <>
      <SettingsPageShell title="Appearance" eyebrow="Setup" data-testid="settings-appearance-page">
        <div className="flex w-full flex-col gap-1.5">
          <div className="flex flex-col gap-2 px-2 py-2">
            <div className="flex items-center gap-3">
              <span className="flex min-w-[220px] shrink-0 items-center gap-2 text-sm font-medium" dir={dir}>
                <Icon icon="lucide:languages" className="h-4 w-4 text-muted-foreground" />
                <span className="truncate">Language</span>
              </span>
              <div className="ml-auto w-auto">
                <Select value={selectedLanguage} onValueChange={setSelectedLanguage}>
                  <SelectTrigger data-testid="language-select" className="h-8!">
                    <SelectValue placeholder="Select language" />
                  </SelectTrigger>
                  <SelectContent>
                    {languageOptions.map((lang) => (
                      <SelectItem key={lang.value} value={lang.value} dir={dir}>
                        {lang.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 px-2 py-2">
            <div className="flex items-center gap-3">
              <span className="flex min-w-[220px] shrink-0 items-center gap-2 text-sm font-medium" dir={dir}>
                <Icon icon="lucide:sun-moon" className="h-4 w-4 text-muted-foreground" />
                <span className="truncate">Theme</span>
              </span>
              <span className="ml-auto text-xs text-muted-foreground">Select theme</span>
            </div>
            <div className="flex flex-wrap gap-3">
              {themeOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  data-testid="theme-toggle"
                  data-theme-mode={option.value}
                  className={`group relative flex w-full max-w-[120px] basis-[120px] flex-col items-center text-left outline-none transition disabled:cursor-not-allowed disabled:opacity-80`}
                  aria-pressed={themeMode === option.value}
                  disabled={isUpdatingTheme}
                  onClick={() => void selectThemeMode(option.value)}
                >
                  <div
                    className={`relative h-28 w-full rounded-xl border transition-all duration-200 ${
                      themeMode === option.value
                        ? "border-primary shadow-[0_18px_36px_-20px_rgba(59,130,246,0.7)] ring-2 ring-primary/30"
                        : "border-border/70 bg-background/30 group-hover:border-muted-foreground/60 group-hover:bg-background/50"
                    }`}
                  >
                    {themeMode === option.value && (
                      <span className="absolute right-4 top-4 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm shadow-primary/30">
                        <Icon icon="lucide:check" className="h-3.5 w-3.5" />
                      </span>
                    )}
                    <div className="absolute inset-2 rounded-[14px]">
                      {option.value !== "system" ? (
                        <div
                          className={`flex h-full w-full flex-col overflow-hidden rounded-[12px] border ${themePreviewStyles[option.value].window}`}
                        >
                          <div
                            className={`flex items-center gap-1 rounded-t-[12px] border-b px-2.5 py-1.5 ${themePreviewStyles[option.value].toolbar}`}
                          >
                            <span className="h-2 w-2 rounded-full bg-red-400/90" />
                            <span className="h-2 w-2 rounded-full bg-amber-400/90" />
                            <span className="h-2 w-2 rounded-full bg-emerald-400/90" />
                          </div>
                          <div className="flex flex-1">
                            <div
                              className={`flex w-14 shrink-0 flex-col gap-1.5 border-r p-2 ${themePreviewStyles[option.value].sidebar}`}
                            >
                              {[1, 2, 3].map((idx) => (
                                <span
                                  key={idx}
                                  className={`h-2 rounded-full ${
                                    idx === 1
                                      ? themePreviewStyles[option.value].accent
                                      : themePreviewStyles[option.value].muted
                                  }`}
                                />
                              ))}
                            </div>
                            <div
                              className={`flex flex-1 flex-col gap-1.5 p-2.5 ${themePreviewStyles[option.value].content}`}
                            >
                              {[1, 2, 3].map((idx) => (
                                <span
                                  key={idx}
                                  className={`h-2.5 rounded-full ${
                                    idx === 1
                                      ? themePreviewStyles[option.value].accent
                                      : themePreviewStyles[option.value].text
                                  }`}
                                />
                              ))}
                              <div
                                className={`mt-auto h-2 w-1/2 rounded-full ${themePreviewStyles[option.value].muted}`}
                              />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="grid h-full w-full grid-cols-2 overflow-hidden rounded-[12px] bg-gradient-to-br from-slate-900/70 via-background/80 to-white/90">
                          <div className="flex flex-col gap-1.5 bg-slate-950/80 p-2">
                            <span className="flex items-center gap-1 text-[10px] font-medium text-slate-200/90">
                              <span className="h-2 w-2 rounded-full bg-sky-400/80" />
                              Dark
                            </span>
                            <span className="h-2 rounded-full bg-sky-400/70" />
                            <span className="h-2 rounded-full bg-slate-700/70" />
                            <span className="h-2 rounded-full bg-slate-700/70" />
                            <div className="mt-auto h-2 w-1/2 rounded-full bg-slate-800/70" />
                          </div>
                          <div className="flex flex-col gap-1.5 bg-white/95 p-2">
                            <span className="flex items-center gap-1 text-[10px] font-medium text-slate-600">
                              <span className="h-2 w-2 rounded-full bg-blue-500/70" />
                              Light
                            </span>
                            <span className="h-2 rounded-full bg-blue-500/60" />
                            <span className="h-2 rounded-full bg-slate-200/80" />
                            <span className="h-2 rounded-full bg-slate-200/80" />
                            <div className="mt-auto h-2 w-1/2 rounded-full bg-slate-300/80" />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 text-xs font-medium text-foreground">{option.label}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2 px-2 py-2">
            <div className="flex items-center gap-3">
              <span className="flex min-w-[220px] shrink-0 items-center gap-2 text-sm font-medium" dir={dir}>
                <Icon icon="lucide:bell" className="h-4 w-4 text-muted-foreground" />
                <span className="truncate">Notifications</span>
              </span>
              <div className="ml-auto">
                <Switch
                  id="notifications-switch"
                  checked={notificationsEnabled}
                  onCheckedChange={handleNotificationsChange}
                />
              </div>
            </div>
            <div className="text-xs text-muted-foreground">Show system notifications for messages and updates</div>
          </div>

          <div className="flex flex-col gap-2 px-2 py-2">
            <span className="flex min-w-[220px] shrink-0 items-center gap-2 text-sm font-medium" dir={dir}>
              <Icon icon="lucide:a-large-small" className="h-4 w-4 text-muted-foreground" />
              <span className="truncate">Font Size</span>
            </span>
            <ButtonGroup className="flex-wrap">
              {fontSizeOptions.map((_sizeOption, index) => (
                <Button
                  key={index}
                  variant={fontSizeLevel === index ? "default" : "outline"}
                  size="sm"
                  className="shrink-0 px-2 py-1.5 text-xs"
                  onClick={() => setFontSizeLevel(index)}
                >
                  {fontSizeLabels[index]}
                </Button>
              ))}
            </ButtonGroup>
          </div>

          <FontSettingsSection />

          <div className="flex items-center gap-3 px-2 py-2">
            <span className="flex min-w-[220px] shrink-0 items-center gap-2 text-sm font-medium" dir={dir}>
              <Icon icon="lucide:monitor" className="h-4 w-4 text-muted-foreground" />
              <span className="truncate">Content Protection</span>
            </span>
            <div className="ml-auto">
              <Switch
                id="content-protection-switch"
                checked={contentProtectionEnabled}
                onCheckedChange={handleContentProtectionChange}
              />
            </div>
          </div>

          {FLOATING_BUTTON_AVAILABLE && (
            <div className="flex flex-col gap-2 px-2 py-2">
              <div className="flex items-center gap-3">
                <span className="flex min-w-[220px] shrink-0 items-center gap-2 text-sm font-medium" dir={dir}>
                  <Icon icon="lucide:mouse-pointer-click" className="h-4 w-4 text-muted-foreground" />
                  <span className="truncate">Floating Button</span>
                </span>
                <div className="ml-auto">
                  <Switch
                    id="floating-button-switch"
                    checked={floatingButtonStore.enabled}
                    onCheckedChange={handleFloatingButtonChange}
                  />
                </div>
              </div>
              <div className="text-xs text-muted-foreground">Show a floating button for quick access</div>
            </div>
          )}
        </div>
      </SettingsPageShell>

      <Dialog open={isContentProtectionDialogOpen} onOpenChange={setIsContentProtectionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Content Protection</DialogTitle>
            <DialogDescription>
              {newContentProtectionValue
                ? "Content protection will be enabled. This may affect screen capture."
                : "Content protection will be disabled."}
              <div className="mt-2 font-medium">The app needs to restart for changes to take effect.</div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={cancelContentProtectionChange}>
              Cancel
            </Button>
            <Button
              variant={newContentProtectionValue ? "default" : "destructive"}
              onClick={confirmContentProtectionChange}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

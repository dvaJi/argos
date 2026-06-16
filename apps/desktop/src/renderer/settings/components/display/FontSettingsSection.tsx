import { useState, useEffect, useMemo } from "react";
import { useStore } from "@tanstack/react-store";
import { Icon } from "@iconify/react";
import { Button } from "@shadcn/components/ui/button";
import { Input } from "@shadcn/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@shadcn/components/ui/popover";
import { ScrollArea } from "@shadcn/components/ui/scroll-area";
import { Spinner } from "@shadcn/components/ui/spinner";
import {
  uiSettingsStore,
  setFontFamily,
  setCodeFontFamily,
  resetFontSettings,
  fetchSystemFonts,
  getFormattedFontFamily,
  getFormattedCodeFontFamily,
} from "@/stores/uiSettingsStore";
import { languageStore } from "@/stores/language";

const FALLBACK_FONTS = [
  "Geist",
  "Inter",
  "SF Pro Text",
  "SF Pro Display",
  "Helvetica Neue",
  "Helvetica",
  "Arial",
  "Segoe UI",
  "Roboto",
  "Noto Sans",
  "JetBrains Mono",
  "Fira Code",
  "Menlo",
  "Monaco",
  "Consolas",
  "Courier New",
];

const PREVIEW_FALLBACK = "ui-sans-serif, system-ui, sans-serif";

function buildFontPreview(font: string): string {
  const normalized = (font || "").trim();
  if (!normalized) return PREVIEW_FALLBACK;
  const wrapped = /\s/.test(normalized) && !normalized.includes(",") ? `"${normalized}"` : normalized;
  return `${wrapped}, ${PREVIEW_FALLBACK}`;
}

export default function FontSettingsSection() {
  const fontFamily = useStore(uiSettingsStore, (s) => s.fontFamily);
  const codeFontFamily = useStore(uiSettingsStore, (s) => s.codeFontFamily);
  const systemFonts = useStore(uiSettingsStore, (s) => s.systemFonts);
  const isLoadingFonts = useStore(uiSettingsStore, (s) => s.isLoadingFonts);

  const [textPopoverOpen, setTextPopoverOpen] = useState(false);
  const [codePopoverOpen, setCodePopoverOpen] = useState(false);
  const [textQuery, setTextQuery] = useState("");
  const [codeQuery, setCodeQuery] = useState("");
  const [isResetting, setIsResetting] = useState(false);

  const availableFonts = useMemo(
    () => [...(systemFonts.length > 0 ? systemFonts : FALLBACK_FONTS)].sort((a, b) => a.localeCompare(b)),
    [systemFonts],
  );

  const filteredTextFonts = useMemo(
    () => availableFonts.filter((font) => font.toLowerCase().includes((textQuery || "").toLowerCase())),
    [availableFonts, textQuery],
  );

  const filteredCodeFonts = useMemo(
    () => availableFonts.filter((font) => font.toLowerCase().includes((codeQuery || "").toLowerCase())),
    [availableFonts, codeQuery],
  );

  const defaultLabel = "Default";
  const textFontLabel = fontFamily || defaultLabel;
  const codeFontLabel = codeFontFamily || defaultLabel;

  const textPreviewFont = getFormattedFontFamily();
  const codePreviewFont = getFormattedCodeFontFamily();

  const selectTextFont = async (font: string) => {
    await setFontFamily(font);
    setTextPopoverOpen(false);
  };

  const selectCodeFont = async (font: string) => {
    await setCodeFontFamily(font);
    setCodePopoverOpen(false);
  };

  const handleReset = async () => {
    setIsResetting(true);
    try {
      await resetFontSettings();
    } finally {
      setIsResetting(false);
    }
  };

  useEffect(() => {
    void fetchSystemFonts();
  }, []);

  const renderFontPicker = (
    popoverOpen: boolean,
    setPopoverOpen: (v: boolean) => void,
    query: string,
    setQuery: (v: string) => void,
    filteredFonts: string[],
    currentFont: string,
    previewFont: string,
    label: string,
    onSelect: (font: string) => void,
  ) => (
    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-between h-9" style={{ fontFamily: previewFont }}>
          <span className="truncate">{label}</span>
          <Icon icon="lucide:chevrons-up-down" className="h-4 w-4 text-muted-foreground/70" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <div className="p-2" style={{ fontFamily: PREVIEW_FALLBACK }}>
          <div className="flex items-center gap-2 mb-2">
            <Icon icon="lucide:search" className="h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search fonts..."
              className="h-8"
              style={{ fontFamily: PREVIEW_FALLBACK }}
            />
          </div>
          <ScrollArea className="h-64">
            <div className="flex flex-col">
              <button
                type="button"
                className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-muted text-left transition${currentFont === "" ? " border border-primary/60 bg-primary/5" : ""}`}
                style={{ fontFamily: PREVIEW_FALLBACK }}
                onClick={() => onSelect("")}
              >
                <span className="truncate">{defaultLabel}</span>
                {currentFont === "" && <Icon icon="lucide:check" className="h-4 w-4 text-primary" />}
              </button>
              {filteredFonts.map((font) => (
                <button
                  key={font}
                  type="button"
                  className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-muted text-left transition${currentFont === font ? " border border-primary/60 bg-primary/5" : ""}`}
                  style={{ fontFamily: buildFontPreview(font) }}
                  onClick={() => onSelect(font)}
                >
                  <span className="truncate">{font}</span>
                  {currentFont === font && <Icon icon="lucide:check" className="h-4 w-4 text-primary" />}
                </button>
              ))}
              {!filteredFonts.length && (
                <p className="px-2 py-3 text-center text-xs text-muted-foreground">No fonts found</p>
              )}
            </div>
          </ScrollArea>
        </div>
      </PopoverContent>
    </Popover>
  );

  return (
    <div className="flex flex-col gap-3 px-2 py-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span
          className="flex items-center gap-2 text-sm font-medium shrink-0 min-w-[220px]"
          dir={languageStore.state.dir}
        >
          <Icon icon="lucide:type" className="w-4 h-4 text-muted-foreground" />
          <span className="truncate">Font</span>
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 md:h-8 px-3 w-full md:w-auto justify-center"
          disabled={isResetting || (!fontFamily && !codeFontFamily)}
          onClick={handleReset}
        >
          <Icon icon="lucide:rotate-ccw" className="h-4 w-4 mr-1.5" />
          Reset
        </Button>
      </div>

      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        {isLoadingFonts && <Spinner className="h-3 w-3" />}
        <span>{isLoadingFonts ? "Loading system fonts..." : "Select fonts for the interface and code blocks."}</span>
      </div>

      <div className="flex flex-col gap-4">
        <div className="space-y-1.5">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground md:w-32 shrink-0">
              <span className="text-foreground font-medium text-sm">Interface font</span>
            </div>
            <div className="w-full md:w-[260px] ml-auto">
              {renderFontPicker(
                textPopoverOpen,
                setTextPopoverOpen,
                textQuery,
                setTextQuery,
                filteredTextFonts,
                fontFamily,
                textPreviewFont,
                textFontLabel,
                selectTextFont,
              )}
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed" style={{ fontFamily: textPreviewFont }}>
            Font used for the main application interface and chat messages.
          </p>
        </div>

        <div className="space-y-1.5">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground md:w-32 shrink-0">
              <span className="text-foreground font-medium text-sm">Code font</span>
            </div>
            <div className="w-full md:w-[260px] ml-auto">
              {renderFontPicker(
                codePopoverOpen,
                setCodePopoverOpen,
                codeQuery,
                setCodeQuery,
                filteredCodeFonts,
                codeFontFamily,
                codePreviewFont,
                codeFontLabel,
                selectCodeFont,
              )}
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed" style={{ fontFamily: codePreviewFont }}>
            Font used for code blocks and monospace content.
          </p>
        </div>
      </div>
    </div>
  );
}

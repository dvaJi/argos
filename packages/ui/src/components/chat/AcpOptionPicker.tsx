import { useState } from "react";
import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import { Input } from "#shadcn/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "#shadcn/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "#shadcn/components/ui/tooltip";
import { favoriteKey, toggleFavorite, useModelFavorites } from "#/stores/ui/modelFavorites";
import { LABS, canonicalLab, inferLabFromModel } from "./acpModelLabs";
import { getAcpOptionIcon } from "./acpOptionKind";
import type { AcpConfigOption } from "@argos/shared/presenter";

type AcpOptionEntry = NonNullable<AcpConfigOption["options"]>[number];

/** Pill scope: every entry, favorites only, or a single group key. */
type RailFilter = "all" | "favorites" | (string & {});

/** Above this many entries the picker shows a search box. */
const SEARCH_THRESHOLD = 7;
/** Rows per group in the "All" view before a "N more…" link. */
const GROUP_LIMIT = 12;

/** `labId` is a canonical id from `LABS` (drives the logo); null = unknown lab / no lab. */
type EntryGroup = { key: string; label: string; labId: string | null };

const labGroup = (rawLab: string): EntryGroup => {
  const canonical = canonicalLab(rawLab);
  if (canonical) return { key: `__lab__${canonical}`, label: LABS[canonical]!.name, labId: canonical };
  return { key: `__lab__${rawLab.trim().toLowerCase()}`, label: rawLab.trim(), labId: null };
};

/**
 * Group for an entry, in order of trust: the agent's explicit group, a
 * `lab/model` prefix, then the lab inferred from the model family name.
 * Known labs merge across sources (e.g. "MiniMaxAI" group + "MiniMax" prefix);
 * unrecognized models fall into an unnamed group.
 */
const resolveGroup = (entry: AcpOptionEntry): EntryGroup => {
  const groupId = entry.groupId?.trim();
  if (groupId) {
    const lab = canonicalLab(groupId) ?? (entry.groupLabel ? canonicalLab(entry.groupLabel) : null);
    if (lab) return labGroup(lab);
    return { key: groupId, label: entry.groupLabel?.trim() || groupId, labId: null };
  }
  // A `x/y` prefix is only an org when it names a known lab — Codex-style
  // values put the *model* before the slash (`gpt-5.1-codex/high`), which
  // must group by the model family, not one group per model.
  const prefix = slashPrefix(entry.value) ?? slashPrefix(entry.label);
  const prefixLab = prefix ? canonicalLab(prefix) : null;
  if (prefixLab) return labGroup(prefixLab);
  const inferred = inferLabFromModel(entry.value, entry.label);
  if (inferred) return labGroup(inferred);
  // Unknown org-looking prefix (`nousresearch/hermes-4`): keep it as its own group.
  if (prefix && !/\d/.test(prefix)) return labGroup(prefix);
  return { key: "__default__", label: "", labId: null };
};

const slashPrefix = (text: string): string | null => {
  const idx = text.indexOf("/");
  return idx > 0 && text.slice(idx + 1).trim() ? text.slice(0, idx).trim() : null;
};

/**
 * Strips an org prefix (`anthropic/claude-…` → `claude-…`) since the group
 * header already shows the lab. Model-first labels (`gpt-5.1-codex/high`)
 * are left intact.
 */
const displayLabel = (entry: { label: string }): string => {
  const prefix = slashPrefix(entry.label);
  if (!prefix || !(canonicalLab(prefix) || !/\d/.test(prefix))) return entry.label;
  return entry.label.slice(entry.label.indexOf("/") + 1);
};

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{children}</div>
);

const Pill = ({
  active,
  label,
  onClick,
  iconOnly = false,
  children,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  /** Render just the icon (children); the label moves to a hover tooltip. */
  iconOnly?: boolean;
  children?: React.ReactNode;
}) => {
  const className = `flex h-6 shrink-0 items-center gap-1.5 rounded-full border text-xs transition-colors ${
    iconOnly ? "w-8 justify-center" : "px-2.5"
  } ${
    active
      ? "border-primary/40 bg-primary/10 text-foreground"
      : "border-border/60 text-muted-foreground hover:border-border hover:text-foreground"
  }`;
  if (!iconOnly) {
    return (
      <button type="button" aria-pressed={active} className={className} onClick={onClick}>
        {children}
        <span className="max-w-[120px] truncate">{label}</span>
      </button>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button type="button" aria-pressed={active} aria-label={label} className={className} onClick={onClick} />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
};

/**
 * Lab logo for a row / pill; a neutral box for unknown labs. Single-color
 * logos render as a mask tinted with the current text color so they stay
 * visible in dark mode.
 */
const LabIcon = ({ labId, className }: { labId: string | null; className: string }) => {
  const lab = labId ? LABS[labId] : undefined;
  if (!lab) return <Icon icon="lucide:box" className={`${className} shrink-0 text-muted-foreground`} />;
  if (lab.mono) {
    const mask = `url("${lab.icon}") center / contain no-repeat`;
    return (
      <span
        aria-hidden
        className={`${className} inline-block shrink-0 bg-current text-foreground`}
        style={{ mask, WebkitMask: mask }}
      />
    );
  }
  return <img src={lab.icon} alt="" aria-hidden className={`${className} shrink-0 object-contain`} />;
};

interface EntryRowProps {
  optionId: string;
  entry: AcpOptionEntry;
  selected: boolean;
  /** `null` hides the star (favorites disabled for this option). */
  favorited: boolean | null;
  /** Lab icon id; `undefined` hides the icon column (non-model options). */
  labIconId?: string | null;
  onSelect: () => void;
  onToggleFavorite: () => void;
}

/**
 * Selectable row (div with option semantics so the star can be a nested
 * control). Same look as the Argos `ModelRow`, plus a one-line description.
 */
const EntryRow = ({ optionId, entry, selected, favorited, labIconId, onSelect, onToggleFavorite }: EntryRowProps) => (
  <div
    role="option"
    tabIndex={0}
    aria-selected={selected}
    data-option-id={optionId}
    data-value={entry.value}
    title={entry.description ? `${displayLabel(entry)} — ${entry.description}` : undefined}
    className={`acp-inline-option-item group flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left outline-none hover:bg-accent focus-visible:bg-accent ${selected ? "bg-accent" : ""}`}
    onClick={onSelect}
    onKeyDown={(event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onSelect();
      }
    }}
  >
    {labIconId !== undefined && <LabIcon labId={labIconId} className="h-4 w-4" />}
    <div className="min-w-0 flex-1">
      <div className="truncate text-sm">{displayLabel(entry)}</div>
      {entry.description && <div className="truncate text-xs text-muted-foreground">{entry.description}</div>}
    </div>
    {favorited !== null && (
      <button
        type="button"
        tabIndex={-1}
        aria-label={favorited ? "Remove from favorites" : "Add to favorites"}
        title={favorited ? "Remove from favorites" : "Add to favorites"}
        className={`h-6 w-6 shrink-0 rounded p-0.5 hover:text-foreground ${favorited ? "text-amber-400" : "text-transparent group-hover:text-muted-foreground"}`}
        onClick={(event) => {
          event.stopPropagation();
          onToggleFavorite();
        }}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <Icon icon="lucide:star" className={`h-3.5 w-3.5 ${favorited ? "fill-current" : ""}`} />
      </button>
    )}
    {selected && <Icon icon="lucide:check" className="h-3.5 w-3.5 shrink-0 text-primary" />}
  </div>
);

interface AcpOptionPickerProps {
  option: AcpConfigOption;
  open: boolean;
  readOnly: boolean;
  isSaving: boolean;
  displayValue: string;
  /**
   * Namespace for favorites (e.g. `acp:<agentId>`). When set, the picker
   * shows All / Favorites / group pills and star toggles, like the Argos
   * model picker. Omit for options where favorites make no sense (mode, …).
   */
  favoritesScope?: string | null;
  onSelect: (optionId: string, value: string) => void;
  onOpenChange: (open: boolean) => void;
}

/** Composer chip + popover for one ACP select option (model, mode, …). */
const AcpOptionPicker = ({
  option,
  open,
  readOnly,
  isSaving,
  displayValue,
  favoritesScope = null,
  onSelect,
  onOpenChange,
}: AcpOptionPickerProps) => {
  const [keyword, setKeyword] = useState("");
  const [railFilter, setRailFilter] = useState<RailFilter>("all");
  const favoriteKeys = useModelFavorites();
  const entries = option.options ?? [];
  const currentValue = String(option.currentValue ?? "");
  const withFavorites = Boolean(favoritesScope);
  const isFavorite = (entry: AcpOptionEntry) =>
    withFavorites && favoriteKeys.includes(favoriteKey(favoritesScope!, entry.value));

  const kw = keyword.trim().toLowerCase();
  const isSearching = kw.length > 0;
  const matches = (e: AcpOptionEntry) => `${e.label} ${e.value} ${e.description ?? ""}`.toLowerCase().includes(kw);
  const filtered = isSearching ? entries.filter(matches) : entries;

  const allGroups = entries.reduce<Map<string, { label: string; labId: string | null; entries: AcpOptionEntry[] }>>(
    (acc, entry) => {
      const g = resolveGroup(entry);
      if (!acc.has(g.key)) acc.set(g.key, { label: g.label, labId: g.labId, entries: [] });
      acc.get(g.key)!.entries.push(entry);
      return acc;
    },
    new Map(),
  );
  const namedGroups = [...allGroups.entries()].filter(([, g]) => g.label);
  const favoriteEntries = filtered.filter(isFavorite);
  // Lab icons only make sense for model lists (some entry maps to a lab).
  const showLabIcons = namedGroups.length > 0;

  // A rail target can vanish (favorites cleared / agent switched) — fall back to all.
  const activeRail: RailFilter =
    railFilter === "all" || (railFilter === "favorites" && entries.some(isFavorite)) || allGroups.has(railFilter)
      ? railFilter
      : "all";
  const showPills = withFavorites && (namedGroups.length > 1 || entries.some(isFavorite));
  const showSearch = withFavorites || entries.length > SEARCH_THRESHOLD;

  // Searching always spans everything; otherwise the rail scopes the list.
  const visibleGroups = (() => {
    if (!isSearching && activeRail === "favorites") return [];
    const scoped =
      !isSearching && activeRail !== "all" ? filtered.filter((e) => resolveGroup(e).key === activeRail) : filtered;
    return [
      ...scoped
        .reduce<Map<string, { label: string; labId: string | null; entries: AcpOptionEntry[] }>>((acc, entry) => {
          const g = resolveGroup(entry);
          if (!acc.has(g.key)) acc.set(g.key, { label: g.label, labId: g.labId, entries: [] });
          acc.get(g.key)!.entries.push(entry);
          return acc;
        }, new Map())
        .entries(),
    ];
  })();
  const visibleFavorites = isSearching || activeRail === "all" || activeRail === "favorites" ? favoriteEntries : [];
  const groupLimit = withFavorites && !isSearching && activeRail === "all" ? GROUP_LIMIT : Number.POSITIVE_INFINITY;

  const handleOpenChange = (next: boolean) => {
    if (!next) setKeyword("");
    onOpenChange(next);
  };
  const handleSelect = (entry: AcpOptionEntry) => {
    if (entry.value !== currentValue) onSelect(option.id, entry.value);
    handleOpenChange(false);
  };
  const renderRow = (entry: AcpOptionEntry, keyPrefix = "") => (
    <EntryRow
      key={`${keyPrefix}${entry.value}`}
      optionId={option.id}
      entry={entry}
      selected={currentValue === entry.value}
      favorited={withFavorites ? isFavorite(entry) : null}
      labIconId={showLabIcons ? resolveGroup(entry).labId : undefined}
      onSelect={() => handleSelect(entry)}
      onToggleFavorite={() => toggleFavorite(favoritesScope!, entry.value)}
    />
  );

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            data-option-id={option.id}
            title={option.label}
            className="acp-inline-option h-7 max-w-[12rem] min-w-0 gap-1.5 rounded-full px-2.5 text-xs text-muted-foreground hover:text-foreground"
            disabled={readOnly || isSaving}
          />
        }
      >
        <Icon icon={getAcpOptionIcon(option)} className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate font-medium">{isSaving ? "Saving…" : displayValue}</span>
        <Icon icon="lucide:chevron-down" className="h-3 w-3 shrink-0 opacity-60" />
      </PopoverTrigger>
      <PopoverContent
        className={`${withFavorites ? "w-[440px]" : "w-[340px]"} max-w-[calc(100vw-1rem)] p-0`}
        align="start"
        sideOffset={8}
      >
        <div className={`flex flex-col ${withFavorites ? "h-[460px]" : "max-h-[420px]"}`}>
          {showSearch ? (
            <div className="p-2">
              <div className="relative">
                <Icon
                  icon="lucide:search"
                  className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  placeholder={`Search ${option.label.toLowerCase()}s...`}
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  className="h-8 pl-8 text-sm"
                  autoFocus
                />
              </div>
            </div>
          ) : (
            <div className="px-2 pt-2">
              <SectionLabel>{option.label}</SectionLabel>
            </div>
          )}
          {showPills && (
            <div className="scrollbar-hide flex shrink-0 gap-1.5 overflow-x-auto px-2 pb-2">
              <Pill active={activeRail === "all"} label="All" onClick={() => setRailFilter("all")} />
              {entries.some(isFavorite) && (
                <Pill active={activeRail === "favorites"} label="Favorites" onClick={() => setRailFilter("favorites")}>
                  <Icon icon="lucide:star" className="h-3 w-3" />
                </Pill>
              )}
              {namedGroups.length > 1 &&
                namedGroups.map(([key, group]) => (
                  <Pill
                    key={key}
                    active={activeRail === key}
                    label={group.label}
                    iconOnly
                    onClick={() => setRailFilter(key)}
                  >
                    <LabIcon labId={group.labId} className="h-3.5 w-3.5" />
                  </Pill>
                ))}
            </div>
          )}
          <div className="flex-1 overflow-y-auto px-2 pb-2" role="listbox" aria-label={option.label}>
            {visibleGroups.length === 0 && visibleFavorites.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                {entries.length === 0 ? "No options available" : "No matches"}
              </div>
            ) : (
              <>
                {visibleFavorites.length > 0 && (
                  <div className="mb-3">
                    <SectionLabel>Favorites</SectionLabel>
                    {visibleFavorites.map((entry) => renderRow(entry, "fav:"))}
                  </div>
                )}
                {visibleGroups.map(([key, group]) => (
                  <div key={key} className="mb-3 last:mb-0">
                    {(group.label || namedGroups.length > 0 || (withFavorites && visibleFavorites.length > 0)) && (
                      <SectionLabel>
                        {group.label || (namedGroups.length > 0 ? "Other" : `All ${option.label.toLowerCase()}s`)}
                      </SectionLabel>
                    )}
                    {group.entries.slice(0, groupLimit).map((entry) => renderRow(entry))}
                    {group.entries.length > groupLimit && (
                      <button
                        type="button"
                        className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => setRailFilter(key)}
                      >
                        {group.entries.length - groupLimit} more…
                      </button>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default AcpOptionPicker;

import { type ReactNode, useEffect, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import { copyRuntimeText } from "#api/runtime";

// ---------------------------------------------------------------------------
// Markdown table — t3code-style card: scrollable viewport (sticky header,
// capped height, edge fades shown only while that side overflows) with a
// chrome row underneath for collapsing the table to a short preview and
// copying it back out as GFM markdown.
// ---------------------------------------------------------------------------

const CHROME_BUTTON_CLASSES =
  "flex h-[22px] w-[22px] items-center justify-center rounded-md text-muted-foreground transition-colors duration-(--dc-motion-fast) ease-(--dc-ease-out-soft) hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70";

type ColumnAlignment = "left" | "center" | "right";

const alignmentMarker = (align: ColumnAlignment): string =>
  align === "center" ? ":---:" : align === "right" ? "---:" : "---";

/** GFM alignment from the cell's inline style (react-markdown emits
 *  `text-align` for aligned columns), falling back to computed style. */
const cellAlignment = (cell: HTMLTableCellElement): ColumnAlignment => {
  let align = cell.style.textAlign;
  if (!align && typeof window.getComputedStyle === "function") {
    align = window.getComputedStyle(cell).textAlign;
  }
  align = (align ?? "").toLowerCase();
  if (align === "center") return "center";
  if (align === "right" || align === "end") return "right";
  return "left";
};

/** DOM table -> GFM pipe table. Cell text is whitespace-collapsed, pipes are
 *  escaped and line breaks become <br> so the output re-parses as one row.
 *  The separator row carries each column's alignment. */
export function serializeTable(table: HTMLTableElement): string {
  const rowCells = Array.from(table.querySelectorAll("tr")).map((row) =>
    Array.from(row.querySelectorAll<HTMLTableCellElement>("th, td")),
  );
  const width = rowCells[0]?.length ?? 0;
  if (width === 0) {
    return "";
  }
  const cellText = (cell: HTMLTableCellElement | undefined): string =>
    (cell?.textContent ?? "")
      .replace(/\r?\n/g, "<br>")
      .replace(/[^\S\r\n]+/g, " ")
      .trim()
      .replace(/\|/g, "\\|");
  const pad = (cells: HTMLTableCellElement[]): HTMLTableCellElement[] => {
    const padded = [...cells];
    while (padded.length < width) {
      padded.push(undefined as unknown as HTMLTableCellElement);
    }
    return padded;
  };
  const alignments = rowCells[0].map(cellAlignment);
  const lines = rowCells.map((cells) => `| ${pad(cells).map(cellText).join(" | ")} |`);
  lines.splice(1, 0, `| ${alignments.map(alignmentMarker).join(" | ")} |`);
  return lines.join("\n");
}

interface MarkdownTableProps {
  children: ReactNode;
}

export function MarkdownTable({ children }: MarkdownTableProps) {
  const tableRef = useRef<HTMLTableElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [overflows, setOverflows] = useState({ left: false, right: false });

  const updateOverflowState = () => {
    const el = viewportRef.current;
    if (!el) {
      return;
    }
    setOverflows({
      left: el.scrollLeft > 2,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2,
    });
  };

  // Overflow flags drive the edge fades; recomputed on scroll and resize so a
  // fade only shows on the side that actually has hidden content.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) {
      return;
    }
    const update = () => {
      setOverflows({
        left: el.scrollLeft > 2,
        right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2,
      });
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(
    () => () => {
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
      }
    },
    [],
  );

  const handleCopy = () => {
    const table = tableRef.current;
    if (!table) {
      return;
    }
    copyRuntimeText(serializeTable(table));
    setCopied(true);
    if (copyTimerRef.current) {
      clearTimeout(copyTimerRef.current);
    }
    copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="not-prose my-[0.65rem] w-full min-w-0 overflow-hidden rounded-xl border border-border shadow-sm">
      <div className="relative">
        <div
          ref={viewportRef}
          onScroll={updateOverflowState}
          className={`overflow-auto overscroll-contain ${isCollapsed ? "max-h-36" : "max-h-96"}`}
        >
          <table ref={tableRef} className="markdown-table w-full">
            {children}
          </table>
        </div>
        {overflows.left && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-background to-transparent"
          />
        )}
        {overflows.right && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-background to-transparent"
          />
        )}
        {isCollapsed && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-7 bg-gradient-to-b from-transparent to-background"
          />
        )}
      </div>
      <div className="flex select-none items-center gap-0.5 border-t border-border/60 bg-muted/40 px-1.5 py-1">
        <button
          type="button"
          aria-label={isCollapsed ? "Expand table" : "Collapse table"}
          aria-pressed={isCollapsed}
          onClick={() => setIsCollapsed((prev) => !prev)}
          className={CHROME_BUTTON_CLASSES}
        >
          <Icon
            icon={isCollapsed ? "lucide:maximize-2" : "lucide:minimize-2"}
            className="h-3.5 w-3.5"
            aria-hidden="true"
          />
        </button>
        <button type="button" aria-label="Copy table" onClick={handleCopy} className={CHROME_BUTTON_CLASSES}>
          <Icon icon={copied ? "lucide:check" : "lucide:copy"} className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

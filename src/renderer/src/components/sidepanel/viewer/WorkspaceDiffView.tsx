import { useMemo } from "react";

type RowType = "add" | "del" | "context" | "hunk" | "meta";

interface DiffRow {
  type: RowType;
  text: string;
  oldNum: number | null;
  newNum: number | null;
}

interface WorkspaceDiffViewProps {
  diff: string;
}

const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

const rowClass = (type: RowType): string => {
  switch (type) {
    case "add":
      return "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300";
    case "del":
      return "bg-rose-500/10 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300";
    case "hunk":
      return "bg-sky-500/10 text-sky-700 dark:text-sky-300";
    case "meta":
      return "text-muted-foreground/70";
    default:
      return "text-foreground";
  }
};

const signFor = (type: RowType): string => {
  if (type === "add") return "+";
  if (type === "del") return "-";
  return " ";
};

export function WorkspaceDiffView({ diff }: WorkspaceDiffViewProps) {
  const rows = useMemo<DiffRow[]>(() => {
    const text = diff ?? "";
    if (!text) return [];

    const result: DiffRow[] = [];
    let oldNum = 0;
    let newNum = 0;

    for (const line of text.split("\n")) {
      const hunk = HUNK_HEADER.exec(line);
      if (hunk) {
        oldNum = Number(hunk[1]);
        newNum = Number(hunk[2]);
        result.push({ type: "hunk", text: line, oldNum: null, newNum: null });
        continue;
      }

      if (
        line.startsWith("diff ") ||
        line.startsWith("index ") ||
        line.startsWith("--- ") ||
        line.startsWith("+++ ") ||
        line.startsWith("old mode ") ||
        line.startsWith("new mode ") ||
        line.startsWith("new file") ||
        line.startsWith("deleted file") ||
        line.startsWith("rename ") ||
        line.startsWith("copy ") ||
        line.startsWith("similarity ") ||
        line.startsWith("dissimilarity ") ||
        line.startsWith("Binary files") ||
        line.startsWith("\\")
      ) {
        result.push({ type: "meta", text: line, oldNum: null, newNum: null });
        continue;
      }

      if (line.startsWith("+")) {
        result.push({ type: "add", text: line.slice(1), oldNum: null, newNum: newNum++ });
        continue;
      }

      if (line.startsWith("-")) {
        result.push({ type: "del", text: line.slice(1), oldNum: oldNum++, newNum: null });
        continue;
      }

      const content = line.startsWith(" ") ? line.slice(1) : line;
      result.push({ type: "context", text: content, oldNum: oldNum++, newNum: newNum++ });
    }

    const last = result[result.length - 1];
    if (last && last.type === "context" && last.text === "") {
      result.pop();
    }

    return result;
  }, [diff]);

  return (
    <div className="font-mono text-xs leading-5">
      <table className="w-full border-collapse">
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className={`align-top ${rowClass(row.type)}`}>
              <td className="w-[1%] select-none whitespace-nowrap px-2 text-right text-muted-foreground/60 tabular-nums">
                {row.oldNum ?? ""}
              </td>
              <td className="w-[1%] select-none whitespace-nowrap px-2 text-right text-muted-foreground/60 tabular-nums">
                {row.newNum ?? ""}
              </td>
              <td className="w-[1%] select-none whitespace-pre px-1 text-center">{signFor(row.type)}</td>
              <td className="whitespace-pre-wrap wrap-break-word break-all pr-3">{row.text}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

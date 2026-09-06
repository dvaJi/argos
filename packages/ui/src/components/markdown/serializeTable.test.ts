// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { serializeTable } from "./MarkdownTable";

const buildTable = (rows: string[][], headerAligns?: (string | undefined)[]): HTMLTableElement => {
  const table = document.createElement("table");
  rows.forEach((cells, rowIndex) => {
    const tr = document.createElement("tr");
    cells.forEach((text, colIndex) => {
      const cell = document.createElement(rowIndex === 0 ? "th" : "td");
      cell.textContent = text;
      const align = rowIndex === 0 ? headerAligns?.[colIndex] : undefined;
      if (align) {
        cell.style.textAlign = align;
      }
      tr.appendChild(cell);
    });
    table.appendChild(tr);
  });
  return table;
};

describe("serializeTable", () => {
  it("serializes a basic table with a separator row", () => {
    const table = buildTable([
      ["A", "B"],
      ["1", "2"],
    ]);
    expect(serializeTable(table)).toBe("| A | B |\n| --- | --- |\n| 1 | 2 |");
  });

  it("escapes pipes in cell text", () => {
    const table = buildTable([["A"], ["a|b"]]);
    expect(serializeTable(table)).toBe("| A |\n| --- |\n| a\\|b |");
  });

  it("converts line breaks to <br> so a cell stays on one row", () => {
    const table = buildTable([["A"], ["x\ny"]]);
    expect(serializeTable(table)).toBe("| A |\n| --- |\n| x<br>y |");
  });

  it("collapses whitespace in cell text", () => {
    const table = buildTable([["A"], ["  a   b  "]]);
    expect(serializeTable(table)).toBe("| A |\n| --- |\n| a b |");
  });

  it("carries column alignment into the separator row", () => {
    const table = buildTable([["A", "B", "C"]], ["center", "right", undefined]);
    expect(serializeTable(table)).toBe("| A | B | C |\n| :---: | ---: | --- |");
  });

  it("pads short rows to the header width", () => {
    const table = buildTable([["A", "B", "C"], ["1"]]);
    expect(serializeTable(table)).toBe("| A | B | C |\n| --- | --- | --- |\n| 1 |  |  |");
  });

  it("returns empty string for a table without rows", () => {
    const table = document.createElement("table");
    expect(serializeTable(table)).toBe("");
  });
});

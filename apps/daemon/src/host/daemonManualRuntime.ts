import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { type ManualSection, rankSections, tokenize } from "./manualTool";

const MAX_SECTIONS = 5_000;
const CACHE_MS = 60_000;

export class DaemonManualRuntime {
  private sections: ManualSection[] | null = null;
  private loadedAt = 0;
  private loading: Promise<ManualSection[]> | null = null;

  async search(query: string, limit = 5): Promise<string> {
    const sections = await this.loadSections();
    const matches = rankSections(sections, query, limit);
    if (matches.length === 0) return `No documentation matched "${query}".`;
    const terms = tokenize(query);
    return matches
      .map((section) => {
        const lower = section.body.toLowerCase();
        const index = terms.map((term) => lower.indexOf(term)).filter((value) => value >= 0).sort((a, b) => a - b)[0] ?? 0;
        const start = Math.max(0, index - 200);
        const snippet = section.body.slice(start, start + 900).trim();
        return `### ${section.heading}\n${section.path}\n${snippet}`;
      })
      .join("\n\n---\n\n");
  }

  private async loadSections(): Promise<ManualSection[]> {
    if (this.sections && Date.now() - this.loadedAt < CACHE_MS) return this.sections;
    if (this.loading) return this.loading;
    this.loading = this.readAll().then((sections) => {
      this.sections = sections;
      this.loadedAt = Date.now();
      this.loading = null;
      return sections;
    });
    return this.loading;
  }

  private async readAll(): Promise<ManualSection[]> {
    const roots = [
      path.resolve(process.cwd(), "docs"),
      path.resolve(import.meta.dir, "../../../../docs"),
      path.resolve(path.dirname(process.execPath), "docs"),
    ];
    const root = roots.find((candidate) => existsSync(candidate));
    if (!root) return [];
    const files = await collectMarkdown(root);
    const sections: ManualSection[] = [];
    for (const file of files) {
      if (sections.length >= MAX_SECTIONS) break;
      const relative = path.relative(root, file).split(path.sep).join("/");
      if (relative.startsWith("archives/")) continue;
      let text: string;
      try {
        text = await Bun.file(file).text();
      } catch {
        continue;
      }
      sections.push(...chunkMarkdown(relative, text));
    }
    return sections;
  }
}

async function collectMarkdown(root: string): Promise<string[]> {
  const files: string[] = [];
  const walk = async (directory: string) => {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile() && entry.name.endsWith(".md")) files.push(full);
    }
  };
  await walk(root);
  return files;
}

function chunkMarkdown(filePath: string, text: string): ManualSection[] {
  const sections: ManualSection[] = [];
  let heading = filePath;
  let body: string[] = [];
  const flush = () => {
    const content = body.join("\n").trim();
    if (content.length > 0) sections.push({ path: filePath, heading, body: content });
    body = [];
  };
  for (const line of text.split(/\r?\n/)) {
    if (/^#{1,3}\s+/.test(line)) {
      flush();
      heading = line.replace(/^#{1,3}\s+/, "").trim();
      body.push(line);
    } else {
      body.push(line);
    }
  }
  flush();
  return sections;
}

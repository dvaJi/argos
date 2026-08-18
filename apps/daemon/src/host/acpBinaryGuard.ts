// bun-file-io-exception: fd-based positioned reads (openSync + read loops) for
// binary header parsing; no Bun equivalent for repeated positioned reads.
import fs from "node:fs";
import path from "node:path";

const TEXT_LIKE_MIMES = new Set([
  "application/json",
  "application/xml",
  "application/javascript",
  "application/x-javascript",
  "application/typescript",
  "application/x-typescript",
  "application/x-sh",
]);

const DOCUMENT_MIMES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.oasis.opendocument.spreadsheet",
]);

const ALWAYS_BINARY_MIMES = new Set([
  "application/zip",
  "application/x-zip",
  "application/gzip",
  "application/x-gzip",
  "application/x-7z-compressed",
  "application/x-rar-compressed",
  "application/wasm",
]);

const EXTENSION_MIME: Record<string, string> = {
  txt: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
  csv: "text/csv",
  tsv: "text/tab-separated-values",
  json: "application/json",
  yaml: "application/yaml",
  yml: "application/yaml",
  xml: "application/xml",
  html: "text/html",
  htm: "text/html",
  css: "text/css",
  js: "application/javascript",
  mjs: "application/javascript",
  cjs: "application/javascript",
  ts: "application/typescript",
  tsx: "application/typescript",
  jsx: "application/javascript",
  sh: "application/x-sh",
  bash: "application/x-sh",
  zsh: "application/x-sh",
  py: "text/x-python",
  rb: "text/x-ruby",
  go: "text/x-go",
  java: "text/x-java",
  c: "text/x-c",
  h: "text/x-c",
  cpp: "text/x-cpp",
  cc: "text/x-cpp",
  hpp: "text/x-cpp",
  cs: "text/x-csharp",
  php: "text/x-php",
  rs: "text/x-rust",
  sql: "text/x-sql",
  log: "text/plain",
  env: "text/plain",
  toml: "text/plain",
  ini: "text/plain",
  cfg: "text/plain",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  zip: "application/zip",
  gz: "application/gzip",
  "7z": "application/x-7z-compressed",
  rar: "application/x-rar-compressed",
  wasm: "application/wasm",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  svg: "image/svg+xml",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  mp4: "video/mp4",
  webm: "video/webm",
  bin: "application/octet-stream",
  exe: "application/octet-stream",
  dll: "application/octet-stream",
  so: "application/octet-stream",
  o: "application/octet-stream",
  class: "application/octet-stream",
};

function isTextLikeMime(mimeType: string): boolean {
  return mimeType.startsWith("text/") || TEXT_LIKE_MIMES.has(mimeType);
}

function sniffMagicMime(filePath: string): string | null {
  try {
    const fd = fs.openSync(filePath, "r");
    const buffer = Buffer.alloc(8);
    const bytesRead = fs.readSync(fd, buffer, 0, 8, 0);
    fs.closeSync(fd);
    if (bytesRead < 2) return null;
    if (buffer[0] === 0x89 && buffer[1] === 0x50) return "image/png";
    if (buffer[0] === 0xff && buffer[1] === 0xd8) return "image/jpeg";
    if (buffer[0] === 0x47 && buffer[1] === 0x49) return "image/gif";
    if (buffer[0] === 0x25 && buffer[1] === 0x50) return "application/pdf";
    if (bytesRead >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) {
      return "application/zip";
    }
  } catch {
    return null;
  }
  return null;
}

function detectMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase().replace(/^\./, "");
  const magic = sniffMagicMime(filePath);
  if (magic) return magic;
  if (EXTENSION_MIME[ext]) return EXTENSION_MIME[ext];
  return "application/octet-stream";
}

function isLikelyTextFile(filePath: string, bytesToRead = 1024): boolean {
  let fd: number | undefined;
  try {
    fd = fs.openSync(filePath, "r");
    const buffer = Buffer.alloc(bytesToRead);
    const bytesRead = fs.readSync(fd, buffer, 0, bytesToRead, 0);
    if (bytesRead === 0) return false;
    const content = buffer.subarray(0, bytesRead);
    if (content.includes(0)) return false;
    let nonTextChars = 0;
    for (let i = 0; i < content.length; i++) {
      const byte = content[i];
      if (!((byte >= 32 && byte <= 126) || byte === 9 || byte === 10 || byte === 13 || byte >= 128)) {
        nonTextChars++;
      }
    }
    const nonTextRatio = bytesRead > 0 ? nonTextChars / bytesRead : 0;
    return nonTextRatio <= 0.1;
  } catch {
    return false;
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {
        // best-effort
      }
    }
  }
}

export async function shouldRejectAcpTextRead(filePath: string): Promise<{
  reject: boolean;
  mimeType: string;
}> {
  const mimeType = detectMimeType(filePath);

  if (isTextLikeMime(mimeType)) {
    return { reject: false, mimeType };
  }

  if (mimeType === "application/octet-stream") {
    const likelyText = isLikelyTextFile(filePath);
    return { reject: !likelyText, mimeType };
  }

  return { reject: true, mimeType };
}

export function buildBinaryReadGuidance(filePath: string, mimeType: string, source: "acp" | "agent"): string {
  const fileName = path.basename(filePath);
  const shared = `Cannot read "${fileName}" as plain text (detected MIME: ${mimeType}).`;

  if (source === "acp") {
    return [
      shared,
      "`fs/read_text_file` only supports text files.",
      "Use OCR/image tooling for images, and convert or extract PDFs/binary formats before reading them as text.",
    ].join(" ");
  }

  return [
    shared,
    "Use image OCR/summary for images, or a dedicated conversion/extraction tool or skill script for binary formats.",
  ].join(" ");
}

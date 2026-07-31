type RuntimeKind = "electron" | "browser";

function getRuntimeKind(): RuntimeKind {
  if (typeof window !== "undefined" && window.__argosRuntimeKind === "browser") {
    return "browser";
  }
  return "electron";
}

export function isBrowserMode(): boolean {
  return getRuntimeKind() === "browser";
}

declare global {
  interface Window {
    __argosRuntimeKind?: string;
  }
}

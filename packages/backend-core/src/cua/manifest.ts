import { CUA_PLUGIN_ID, type ArgosPluginManifest, type CuaEmbeddedRuntimeContract } from "@argos/shared/types/plugin";

const CONTRACT_FIELDS: Array<keyof CuaEmbeddedRuntimeContract> = [
  "hostBundleId",
  "driverVersion",
  "contractVersion",
  "toolsListSchemaVersion",
  "capabilityVersion",
  "mcpProtocolVersion",
];

const nonEmptyTrimmed = (value: unknown, label: string): string => {
  if (typeof value !== "string" || !value.trim() || value !== value.trim()) {
    throw new Error(`${label} must be a non-empty trimmed string`);
  }
  return value;
};

const assertSafeRelativePath = (value: unknown, label: string): string => {
  if (typeof value !== "string" || !value || value.includes("\\")) {
    throw new Error(`${label} must be a non-empty POSIX relative path`);
  }
  const segments = value.split("/");
  if (
    value.startsWith("/") ||
    /^[A-Za-z]:/.test(value) ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error(`${label} is unsafe: ${value}`);
  }
  return value;
};

export const assertPluginManifestLifecycleContract = (manifest: ArgosPluginManifest): void => {
  const runtime = manifest.runtime;
  if (!runtime) {
    return;
  }

  if (runtime.adapter && runtime.adapter !== "cua-embedded-v1") {
    throw new Error(`Plugin ${manifest.id} declares an unsupported runtime adapter: ${runtime.adapter}`);
  }
  if (!runtime.adapter && runtime.adapterContract) {
    throw new Error(`Plugin ${manifest.id} declares an adapter contract without an adapter`);
  }
  if (!runtime.adapter) {
    return;
  }
  if (manifest.id !== CUA_PLUGIN_ID) {
    throw new Error(`The embedded runtime adapter is reserved for ${CUA_PLUGIN_ID}`);
  }
  for (const field of CONTRACT_FIELDS) {
    nonEmptyTrimmed(runtime.adapterContract?.[field], `Plugin ${manifest.id} adapterContract.${field}`);
  }

  const servers = manifest.mcpServers ?? [];
  if (servers.length !== 1) {
    throw new Error(`Plugin ${manifest.id} with an embedded runtime must declare exactly one MCP server`);
  }
  const server = servers[0];
  if (server.id !== runtime.id) {
    throw new Error(`Plugin ${manifest.id} MCP server id must match the runtime id`);
  }
  if (server.startMode !== "onDemand") {
    throw new Error(`Plugin ${manifest.id} embedded MCP server must use startMode "onDemand"`);
  }
  if (server.inheritEnv !== "minimal") {
    throw new Error(`Plugin ${manifest.id} embedded MCP server must use inheritEnv "minimal"`);
  }
  assertSafeRelativePath(runtime.integrityDescriptor, `Plugin ${manifest.id} runtime.integrityDescriptor`);
};

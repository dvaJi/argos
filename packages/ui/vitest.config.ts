import path from "node:path";
import { resolve } from "path";
import { defineConfig } from "vitest/config";
import { createPathAliasPlugin } from "./vite-plugins/path-alias.ts";

/**
 * Vitest config for @argos/ui unit tests. Mirrors the alias surface of
 * vite.config.ts (#/, #api, #shadcn, #settings, @argos/shared*) without the
 * build-only plugins (router codegen, tailwind, react compiler) so tests stay
 * fast and hermetic. DOM-dependent tests need jsdom — enabled globally since
 * the suite is small.
 */

const projectRoot = resolve(".");

const pathAliasOpts = {
  projectRoot,
  rendererSrcDir: path.join(projectRoot, "src"),
  sharedPkgDir: path.join(projectRoot, "..", "..", "packages", "shared", "src"),
  contractsPkgDir: path.join(projectRoot, "..", "..", "packages", "shared-contracts", "src"),
  apiDir: path.join(projectRoot, "api"),
  shadcnDir: path.join(projectRoot, "shadcn"),
  settingsDir: path.join(projectRoot, "settings"),
};

export default defineConfig({
  root: projectRoot,
  resolve: {
    alias: [
      { find: "@argos/shared-contracts", replacement: path.resolve(projectRoot, "..", "..", "packages", "shared-contracts", "src") },
      { find: "@argos/shared", replacement: path.resolve(projectRoot, "..", "..", "packages", "shared", "src") },
      { find: "#api", replacement: resolve("api") },
      { find: "#shadcn", replacement: resolve("shadcn") },
      { find: "#settings", replacement: resolve("settings") },
    ],
  },
  plugins: [createPathAliasPlugin(pathAliasOpts)],
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});

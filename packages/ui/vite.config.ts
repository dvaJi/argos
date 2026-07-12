import path from "node:path";
import { resolve } from "path";
import { defineConfig, loadEnv } from "vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import monacoEditorPlugin from "@dvaji/vite-plugin-monaco-editor";
import tailwindcss from "@tailwindcss/vite";
import babel from "@rolldown/plugin-babel";
import { createPathAliasPlugin } from "./vite-plugins/path-alias";

/**
 * Vite config for the standalone @argos/ui web package.
 *
 * Produces browser-ready static assets in `dist/` consumed by the daemon
 * (served over HTTP) and by the desktop shell (which loads them from
 * the local daemon over `http://127.0.0.1:<port>`).
 *
 * This config deliberately excludes Electron main/preload plugins (electronSimple,
 * electronAssetPlugin) — the UI talks to the backend exclusively through the
 * ArgosBridge transport (IPC when wrapped by the desktop preload, or
 * WebSocketBridge/HttpClient when served directly by the daemon).
 */

export default defineConfig(({ mode }) => {
  const projectRoot = resolve(".");

  const daemonPort = parseInt(process.env.DAEMON_PORT || "9527", 10);

  const pathAliasOpts = {
    projectRoot,
    rendererSrcDir: path.join(projectRoot, "src"),
    sharedPkgDir: path.join(projectRoot, "..", "..", "packages", "shared", "src"),
    contractsPkgDir: path.join(projectRoot, "..", "..", "packages", "shared-contracts", "src"),
    apiDir: path.join(projectRoot, "api"),
    shadcnDir: path.join(projectRoot, "shadcn"),
    settingsDir: path.join(projectRoot, "settings"),
  };
  const pathAlias = () => createPathAliasPlugin(pathAliasOpts);

  const env = loadEnv(mode, process.cwd(), "");
  const processEnvDefines = Object.fromEntries(
    Object.entries(env)
      .filter(([k]) => k.startsWith("VITE_"))
      .map(([k, v]) => [`process.env.${k}`, JSON.stringify(v)]),
  );

  return {
    root: projectRoot,
    define: processEnvDefines,
    resolve: {
      alias: [
        { find: "@argos/shared-contracts", replacement: path.resolve(projectRoot, "..", "..", "packages", "shared-contracts", "src") },
        { find: "@argos/shared", replacement: path.resolve(projectRoot, "..", "..", "packages", "shared", "src") },
        { find: "#api", replacement: resolve("api") },
        { find: "#shadcn", replacement: resolve("shadcn") },
        { find: "#settings", replacement: resolve("settings") },
      ],
    },
    optimizeDeps: {
      exclude: ["stream-monaco"],
      include: ["@antv/infographic", "monaco-editor", "axios"],
    },
    server: {
      port: 5180,
      proxy: {
        "/api": { target: `http://127.0.0.1:${daemonPort}`, changeOrigin: true, ws: true },
      },
    },
    worker: {
      format: "es",
    },
    build: {
      outDir: resolve("dist"),
      emptyOutDir: true,
      cssCodeSplit: false,
      rolldownOptions: {
        input: {
          index: resolve("index.html"),
          settings: resolve("settings/index.html"),
          floating: resolve("floating/index.html"),
          splash: resolve("splash/index.html"),
          browserOverlay: resolve("browser-overlay/index.html"),
          web: resolve("web/index.html"),
        },
      },
    },
    plugins: [
      pathAlias(),
      tanstackRouter({
        target: "react",
        autoCodeSplitting: true,
        routesDirectory: resolve("src/routes"),
        generatedRouteTree: resolve("src/routeTree.gen.ts"),
      }),
      tailwindcss(),
      monacoEditorPlugin({
        languageWorkers: [],
        customWorkers: [
          { label: "editorWorkerService", entry: "monaco-editor/esm/vs/editor/editor.worker.js" },
          { label: "typescript", entry: "monaco-editor/esm/vs/language/typescript/ts.worker.js" },
          { label: "css", entry: "monaco-editor/esm/vs/language/css/css.worker.js" },
          { label: "html", entry: "monaco-editor/esm/vs/language/html/html.worker.js" },
          { label: "json", entry: "monaco-editor/esm/vs/language/json/json.worker.js" },
        ],
        customDistPath(_root, buildOutDir, _base) {
          return path.resolve(buildOutDir, "monacoeditorwork");
        },
      }),
      react(),
      babel({
        presets: [reactCompilerPreset()],
      }),
    ],
  };
});

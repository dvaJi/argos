import path from "node:path";
import { resolve } from "path";
import { defineConfig, loadEnv } from "vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
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

export default defineConfig(({ mode, command }) => {
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
      include: ["@antv/infographic", "axios"],
    },
    server: {
      host: "127.0.0.1",
      port: 5180,
      strictPort: true,
      proxy: {
        "/api/v1": { target: `http://127.0.0.1:${daemonPort}`, changeOrigin: true, ws: true },
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
      react(),
      babel({
        presets: [reactCompilerPreset()],
      }),
      ...(command === "build"
        ? [
            {
              name: "strip-react-scan",
              transformIndexHtml(html: string) {
                return html.replace(/<script\b[^>]*\bsrc="[^"]*react-scan[^"]*"[^>]*><\/script>\s*/gi, "");
              },
            },
          ]
        : []),
    ],
  };
});

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { networkInterfaces, tmpdir } from "node:os";
import { createServer } from "node:net";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { once } from "node:events";
import { WebSocketBridge } from "../packages/client-sdk/src/websocket-bridge.ts";

const repositoryRoot = resolve(import.meta.dirname, "..");
const defaultDaemonPath =
  process.platform === "win32"
    ? join(repositoryRoot, "apps", "daemon", "dist", "argos-daemon.exe")
    : join(repositoryRoot, "apps", "daemon", "dist", "argos-daemon");
const sourceDaemonPath = resolve(process.env.ARGOS_DAEMON_PATH || defaultDaemonPath);
let daemonPath = sourceDaemonPath;

async function findAvailablePort(excludedPort) {
  for (;;) {
    const port = await new Promise((resolvePort, rejectPort) => {
      const server = createServer();
      server.once("error", rejectPort);
      server.listen(0, "0.0.0.0", () => {
        const address = server.address();
        const candidate = typeof address === "object" && address ? address.port : 0;
        server.close((error) => (error ? rejectPort(error) : resolvePort(candidate)));
      });
    });
    if (port !== excludedPort) return port;
  }
}

function findReachableAddress() {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === "IPv4" && !address.internal) return address.address;
    }
  }
  throw new Error("No non-loopback IPv4 address is available for the remote-machine smoke test.");
}

function waitForPairingUrl(child, output) {
  return new Promise((resolvePairing, rejectPairing) => {
    const timeout = setTimeout(() => {
      rejectPairing(new Error("Argos Server did not emit a pairing URL within 30 seconds."));
    }, 30_000);

    const inspect = () => {
      const match = output.value.match(/Pairing URL:\s+(https?:\/\/\S+)/);
      if (!match) return;
      clearTimeout(timeout);
      resolvePairing(new URL(match[1]));
    };

    child.stdout.on("data", (chunk) => {
      output.value += chunk.toString();
      inspect();
    });
    child.stderr.on("data", (chunk) => {
      output.value += chunk.toString();
      inspect();
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      rejectPairing(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      rejectPairing(new Error(`Argos Server exited before pairing was ready (code ${code ?? "unknown"}).`));
    });
  });
}

async function startServer(dataDir, reachableAddress, port = 0) {
  const output = { value: "" };
  const child = spawn(
    daemonPath,
    [
      "--host",
      "0.0.0.0",
      "--port",
      String(port),
      "--data-dir",
      dataDir,
      "--pair",
      "--no-update-check",
    ],
    {
      cwd: dirname(daemonPath),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );

  const emittedPairingUrl = await waitForPairingUrl(child, output);
  const baseUrl = new URL(emittedPairingUrl);
  baseUrl.hostname = reachableAddress;
  baseUrl.pathname = "";
  baseUrl.search = "";
  const pairingUrl = new URL(emittedPairingUrl);
  pairingUrl.hostname = reachableAddress;

  const health = await fetch(new URL("/health", baseUrl));
  assert.equal(health.status, 200, "standalone server health check failed");

  return {
    child,
    baseUrl: baseUrl.toString().replace(/\/$/, ""),
    pairingUrl,
    port: Number(baseUrl.port),
  };
}

async function stopServer(server) {
  if (server.child.exitCode !== null) return;
  server.child.kill();
  await Promise.race([
    once(server.child, "exit"),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Argos Server did not stop within 10 seconds.")), 10_000),
    ),
  ]);
}

async function pair(server) {
  const token = server.pairingUrl.searchParams.get("token");
  assert.ok(token, "pairing URL omitted its one-time token");
  const response = await fetch(new URL("/api/v1/pair", server.baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, kind: "bearer" }),
  });
  const body = await response.json();
  assert.equal(response.status, 200, "pairing exchange failed");
  assert.equal(body.ok, true, "pairing exchange did not succeed");
  assert.ok(body.sessionId, "pairing exchange omitted the session id");
  assert.ok(body.sessionToken, "pairing exchange omitted the bearer session");
  return body;
}

async function connectDesktopTransport(server, sessionToken) {
  const eventsUrl = `${server.baseUrl.replace(/^http/, "ws")}/api/v1/events`;
  const bridge = new WebSocketBridge(eventsUrl, sessionToken);
  await bridge.connect();
  const environment = await bridge.invoke("connection.describeEnvironment", {
    clientVersion: "remote-machine-smoke",
    protocolVersion: 1,
    runtimeKind: "electron",
  });
  return { bridge, environment };
}

async function revoke(server, session) {
  const response = await fetch(new URL(`/api/v1/sessions/${encodeURIComponent(session.sessionId)}`, server.baseUrl), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${session.sessionToken}` },
  });
  assert.equal(response.status, 200, "session revocation failed");
}

async function assertRevoked(server, sessionToken) {
  const response = await fetch(new URL("/api/v1/route", server.baseUrl), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${sessionToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      route: "connection.describeEnvironment",
      input: { protocolVersion: 1, runtimeKind: "electron" },
    }),
  });
  assert.equal(response.status, 401, "revoked bearer session still authorized HTTP routes");
}

async function main() {
  assert.ok(existsSync(sourceDaemonPath), `Standalone Argos Server not found at ${sourceDaemonPath}`);
  const reachableAddress = findReachableAddress();
  const cleanInstallDir = mkdtempSync(join(tmpdir(), "argos-remote-install-"));
  daemonPath = join(cleanInstallDir, process.platform === "win32" ? "argos-daemon.exe" : "argos-daemon");
  copyFileSync(sourceDaemonPath, daemonPath);
  if (process.platform !== "win32") chmodSync(daemonPath, 0o700);
  assert.deepEqual(readdirSync(cleanInstallDir), [daemonPath.split(/[\\/]/).at(-1)], "clean install contains extra files");
  const firstDataDir = mkdtempSync(join(tmpdir(), "argos-remote-e2e-a-"));
  const replacementDataDir = mkdtempSync(join(tmpdir(), "argos-remote-e2e-b-"));
  let server;

  try {
    server = await startServer(firstDataDir, reachableAddress);
    const session = await pair(server);
    const initial = await connectDesktopTransport(server, session.sessionToken);
    const initialEnvironmentId = initial.environment.environmentId;

    const skewed = await initial.bridge.invoke("connection.describeEnvironment", {
      clientVersion: "remote-machine-smoke",
      protocolVersion: 999,
      runtimeKind: "electron",
    });
    assert.equal(skewed.compatible, false, "incompatible protocol version was accepted");
    initial.bridge.close();

    const firstPort = server.port;
    await stopServer(server);
    const restartedPort = await findAvailablePort(firstPort);
    server = await startServer(firstDataDir, reachableAddress, restartedPort);
    assert.notEqual(server.port, firstPort, "daemon restart did not exercise an address change");
    const restarted = await connectDesktopTransport(server, session.sessionToken);
    assert.equal(restarted.environment.environmentId, initialEnvironmentId, "daemon restart changed environment identity");

    await revoke(server, session);
    await assert.rejects(
      restarted.bridge.invoke("connection.describeEnvironment", {
        protocolVersion: 1,
        runtimeKind: "electron",
      }),
      undefined,
      "revoked active WebSocket session remained usable",
    );
    restarted.bridge.close();
    await assertRevoked(server, session.sessionToken);

    const replacementPort = server.port;
    await stopServer(server);
    server = await startServer(replacementDataDir, reachableAddress, replacementPort);
    const replacementSession = await pair(server);
    const replacement = await connectDesktopTransport(server, replacementSession.sessionToken);
    assert.notEqual(
      replacement.environment.environmentId,
      initialEnvironmentId,
      "replacement server at the same URL reused the trusted environment identity",
    );
    replacement.bridge.close();

    console.log(
      "Remote-machine lifecycle smoke passed: pair, authenticated Desktop transport, restart, address change, revoke, identity change, and version skew.",
    );
  } finally {
    if (server) {
      try {
        await stopServer(server);
      } catch (error) {
        console.error("Remote-machine smoke cleanup could not stop Argos Server:", error);
      }
    }
    const temporaryRoot = resolve(tmpdir());
    for (const dataDir of [cleanInstallDir, firstDataDir, replacementDataDir]) {
      try {
        const resolved = resolve(dataDir);
        const relativePath = relative(temporaryRoot, resolved);
        if (!relativePath || relativePath.startsWith("..") || isAbsolute(relativePath)) {
          console.error(`Remote-machine smoke cleanup refused an unsafe directory: ${resolved}`);
          continue;
        }
        rmSync(resolved, { recursive: true, force: true });
      } catch (error) {
        console.error(`Remote-machine smoke cleanup could not remove ${dataDir}:`, error);
      }
    }
  }
}

await main();

import { startDaemon } from "../src/index";

async function run() {
  const daemon = await startDaemon({ port: 0 });
  const port = (daemon as any).port;
  console.log(`Port: ${port}`);

  // Create session
  const res = await fetch(`http://127.0.0.1:${port}/api/v1/route`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ route: "sessions.create", input: { title: "Test" } }),
  });
  const data = await res.json();
  console.log("Response:", JSON.stringify(data, null, 2));

  await daemon.close();
}

run().catch(console.error);

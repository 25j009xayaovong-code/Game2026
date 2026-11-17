import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import test from "node:test";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const wranglerCli = fileURLToPath(new URL("../node_modules/.bin/wrangler", import.meta.url));
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function findAvailablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

test("server-renders the Echo Island game", async () => {
  const port = await findAvailablePort();
  const child = spawn(wranglerCli, ["dev", "--local", "--port", String(port)], {
    cwd: projectRoot,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.setEncoding("utf8").on("data", (chunk) => { output += chunk; });
  child.stderr.setEncoding("utf8").on("data", (chunk) => { output += chunk; });

  try {
    let response;
    for (let attempt = 0; attempt < 200; attempt++) {
      if (child.exitCode !== null) throw new Error(`Wrangler exited early:\n${output}`);
      try {
        response = await fetch(`http://127.0.0.1:${port}/`);
        if (response.ok) break;
      } catch {
        await delay(150);
      }
    }

    assert.ok(response, `Wrangler did not start:\n${output}`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

    const html = await response.text();
    assert.match(html, /<title>Echo Island/);
    assert.match(html, /3D SURVIVAL ADVENTURE/);
    assert.match(html, /เกาะนี้/);
    assert.doesNotMatch(html, /Your site is taking shape|codex-preview/);
  } finally {
    if (child.exitCode === null) {
      const exited = new Promise((resolve) => {
        const timeout = setTimeout(resolve, 5000);
        child.once("exit", () => {
          clearTimeout(timeout);
          resolve();
        });
      });
      child.kill("SIGTERM");
      await exited;
    }
  }
});

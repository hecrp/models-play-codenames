import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const url = process.argv[2];
const output = process.argv[3] ?? join(tmpdir(), "codenames.png");
const waitMs = Number(process.argv[4] ?? 7000);
const width = Number(process.env.SHOT_WIDTH ?? 1500);
const height = Number(process.env.SHOT_HEIGHT ?? 1100);
if (!url) {
  console.error("Uso: node scripts/ui-shot.mjs <url> <salida.png> [espera_ms]");
  process.exit(1);
}

const chromePath =
  process.env.CHROME_PATH ??
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const port = 9333 + Math.floor(Math.random() * 200);
const profile = mkdtempSync(join(tmpdir(), "codenames-chrome-"));

const chrome = spawn(
  chromePath,
  [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    "--window-size=1500,1100",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "about:blank",
  ],
  { stdio: ["ignore", "ignore", "pipe"] },
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForTarget() {
  const started = Date.now();
  while (Date.now() - started < 15_000) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json`);
      if (response.ok) {
        const targets = await response.json();
        const page = targets.find((target) => target.type === "page");
        if (page) return page;
      }
    } catch {
      // Chrome is still starting.
    }
    await sleep(250);
  }
  throw new Error("Chrome no abrió el puerto de depuración.");
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    const pending = new Map();
    let nextId = 1;
    socket.addEventListener("open", () => {
      resolve({
        send(method, params = {}) {
          return new Promise((res, rej) => {
            const id = nextId++;
            pending.set(id, { res, rej });
            socket.send(JSON.stringify({ id, method, params }));
            setTimeout(() => {
              if (pending.has(id)) {
                pending.delete(id);
                rej(new Error(`Timeout: ${method}`));
              }
            }, 20_000);
          });
        },
        close() {
          socket.close();
        },
      });
    });
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id && pending.has(message.id)) {
        const { res, rej } = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) rej(new Error(JSON.stringify(message.error)));
        else res(message.result);
      }
    });
    socket.addEventListener("error", reject);
  });
}

try {
  const page = await waitForTarget();
  const client = await connect(page.webSocketDebuggerUrl);
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await client.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 600,
  });
  await client.send("Page.navigate", { url });
  await sleep(waitMs);
  const expression = process.argv[5];
  if (expression) {
    const result = await client.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    console.log("--- eval ---");
    console.log(JSON.stringify(result.result?.value ?? null));
    await sleep(10_000);
  }
  const shot = await client.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
  });
  writeFileSync(output, Buffer.from(shot.data, "base64"));
  const text = await client.send("Runtime.evaluate", {
    expression: "document.body.innerText",
    returnByValue: true,
  });
  console.log(`Screenshot: ${output}`);
  console.log("--- texto de la página ---");
  console.log(String(text.result?.value ?? "").slice(0, 3000));
  client.close();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  chrome.kill();
}

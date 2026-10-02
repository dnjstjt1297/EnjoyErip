import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";
import { parseAirplaneGLB } from "../js/ui/airplane-model.js";

const base = "http://127.0.0.1:4182";
const results = [], runtimeErrors = [], consoleErrors = [], failedRequests = [];
let browser, page, server;
async function check(name, action) {
  await action();
  results.push(name);
  console.log(`PASS ${name}`);
}
const modelBytes = await readFile(new URL("../assets/models/airplane.glb", import.meta.url));
const data = modelBytes.buffer.slice(modelBytes.byteOffset, modelBytes.byteOffset + modelBytes.byteLength);
const model = parseAirplaneGLB(data);
const sandbox = `<!DOCTYPE html><html><head><meta charset="utf-8"><link rel="icon" href="data:,"><style>
body { margin: 0; background: #f1f7f6; }
#plane { width: 720px; height: 540px; position: relative; }
canvas { width:100%; height:100%; opacity:0; pointer-events:none; }
#plane[data-model-state=ready] canvas { opacity:1; }
#plane[data-model-state=ready] .plane-fallback { display:none; }
.plane-fallback { position:absolute; inset:0; width:100%; height:100%; }
</style></head><body><div id="plane"><canvas id="canvas" aria-hidden="true"></canvas><svg class="plane-fallback" aria-hidden="true"><path d="M30 100L150 60L80 120Z" fill="teal"/></svg></div></body></html>`;

try {
  await check("01 original embedded GLB has volumetric body, wings, tail and twin engines", () => {
    assert.ok(modelBytes.byteLength < 200_000);
    assert.equal(model.document.asset.version, "2.0");
    assert.equal(model.document.buffers[0].uri, undefined);
    for (const name of ["fuselage", "wing-left", "wing-right", "tail-fin", "tailplane-left", "tailplane-right", "engine-left", "engine-right", "cockpit-front-left"]) {
      assert.ok(model.primitives.some((part) => part.name === name), name);
    }
    const body = model.primitives.find((p) => p.name === "fuselage");
    for (let axis = 0; axis < 3; axis++) {
      const values = [...body.positions].filter((_, i) => i % 3 === axis);
      assert.ok(Math.max(...values) - Math.min(...values) > .8, `body axis ${axis} is volumetric`);
    }
    for (const part of model.primitives) {
      assert.equal(part.positions.length, part.normals.length);
      assert.ok([...part.positions, ...part.normals].every(Number.isFinite));
      assert.ok([...part.indices].every((i) => i < part.positions.length / 3));
    }
    assert.throws(() => parseAirplaneGLB(new ArrayBuffer(24)), /Invalid/);
  });
  server = spawn("python3", ["-m", "http.server", "4182", "--bind", "127.0.0.1"], { stdio: "ignore" });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(base)).ok) break; } catch {}
    await delay(100);
  }
  // The default browser is intentionally used: do not hide unsupported WebGL
  // behind test-only flags when verifying the production fallback contract.
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("requestfailed", (request) => failedRequests.push(new URL(request.url()).pathname));
  await page.route(`${base}/model-sandbox`, (route) => route.fulfill({ contentType: "text/html", body: sandbox }));
  await page.goto(`${base}/model-sandbox`);
  const supported = await page.evaluate(async () => {
    const { initAirplaneModel } = await import("/js/ui/airplane-model.js");
    window.modelRenderer = await initAirplaneModel(document.querySelector("canvas"));
    return Boolean(window.modelRenderer);
  });
  await check("02 default Chromium renders the GLB and only then hides the fallback", async () => {
    assert.equal(supported, true, "Default Chromium must render the locally authored 3D model");
    assert.equal(await page.locator("#plane").getAttribute("data-model-state"), "ready");
    assert.equal(await page.locator(".plane-fallback").isVisible(), false);
    const pixels = await page.evaluate(() => {
      window.modelRenderer.render();
      const canvas = document.querySelector("canvas"), gl = canvas.getContext("webgl");
      const bytes = new Uint8Array(canvas.width * canvas.height * 4);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
      let drawn = 0, white = 0, blue = 0;
      for (let i = 0; i < bytes.length; i += 4) {
        if (bytes[i+3] > 200) { drawn++; if (bytes[i] > 160) white++; if (bytes[i+2] > bytes[i]*1.4 && bytes[i+2] > bytes[i+1]*1.15) blue++; }
      }
      return { drawn, white, blue, error: gl.getError() };
    });
    assert.ok(pixels.drawn > 20_000, JSON.stringify(pixels));
    assert.ok(pixels.white > 2_000 && pixels.blue > 2_000, JSON.stringify(pixels));
    assert.equal(pixels.error, 0);
    await mkdir("test-results", { recursive: true });
    await page.locator("#plane").screenshot({ path: "test-results/airplane-model.png" });
  });
  await check("03 resize redraws at bounded DPR and does not introduce an animation loop", async () => {
    const initial = await page.locator("canvas").getAttribute("width");
    await page.locator("#plane").evaluate((element) => { element.style.width = "280px"; element.style.height = "210px"; });
    await page.waitForFunction(() => document.querySelector("canvas").width === 280);
    assert.notEqual(initial, await page.locator("canvas").getAttribute("width"));
    assert.equal(await page.locator("#plane").getAttribute("data-model-state"), "ready");
    const calls = await page.evaluate(async () => {
      const original = window.requestAnimationFrame;
      let count = 0;
      window.requestAnimationFrame = (...args) => { count++; return original(...args); };
      await new Promise((resolve) => setTimeout(resolve, 150));
      window.requestAnimationFrame = original;
      return count;
    });
    assert.equal(calls, 0);
  });
  await check("04 context loss shows the static fallback and restoration redraws", async () => {
    await page.evaluate(() => {
      const gl = document.querySelector("canvas").getContext("webgl");
      window.loseExtension = gl.getExtension("WEBGL_lose_context");
      window.loseExtension.loseContext();
    });
    await page.waitForFunction(() => document.querySelector("#plane").dataset.modelState === "fallback");
    assert.equal(await page.locator(".plane-fallback").isVisible(), true);
    await page.evaluate(() => window.loseExtension.restoreContext());
    await page.waitForFunction(() => document.querySelector("#plane").dataset.modelState === "ready");
  });
  await check("05 dispose releases the enhancement and unsupported WebGL keeps SVG", async () => {
    await page.evaluate(() => window.modelRenderer.dispose());
    assert.equal(await page.locator(".plane-fallback").isVisible(), true);
    const value = await page.evaluate(async () => {
      const { initAirplaneModel } = await import("/js/ui/airplane-model.js");
      const canvas = document.createElement("canvas");
      document.querySelector("#plane").append(canvas);
      canvas.getContext = () => null;
      return await initAirplaneModel(canvas);
    });
    assert.equal(value, null);
    assert.equal(await page.locator("#plane").getAttribute("data-model-state"), "fallback");
  });
  await check("06 no console errors, runtime errors or failed requests", () => {
    assert.deepEqual(consoleErrors, []);
    assert.deepEqual(runtimeErrors, []);
    assert.deepEqual(failedRequests, []);
  });
} finally {
  await mkdir("test-results", { recursive: true });
  await writeFile("test-results/airplane-model.json", JSON.stringify({ passed: results.length, results, runtimeErrors, consoleErrors, failedRequests }, null, 2));
  await browser?.close();
  server?.kill();
}

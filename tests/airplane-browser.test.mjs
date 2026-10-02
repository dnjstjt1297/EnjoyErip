import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const base = process.env.AIRPLANE_BASE_URL || "http://127.0.0.1:4180";
const server = process.env.AIRPLANE_BASE_URL
  ? null
  : spawn("python3", ["-m", "http.server", "4180", "--bind", "127.0.0.1"], {
      stdio: "ignore",
    });
const results = [],
  runtimeErrors = [],
  consoleErrors = [],
  localResourceErrors = [],
  failedRequests = [];
let browser, page;
async function check(name, action) {
  try {
    await action();
    results.push({ name, status: "passed" });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({ name, status: "failed", message: error.message });
    throw error;
  }
}
const advance = (ms) => page.clock.runFor(ms);
async function sample() {
  return page.evaluate(() => {
    const hero = document.querySelector("[data-airplane-hero]");
    const plane = document.querySelector("#heroPlane");
    const style = getComputedStyle(plane),
      matrix = new DOMMatrix(style.transform);
    const bounds = hero.getBoundingClientRect(),
      rect = plane.getBoundingClientRect();
    return {
      state: hero.dataset.flightState,
      running: hero.dataset.flightRunning,
      transform: style.transform,
      x: matrix.e + plane.offsetWidth / 2,
      y: matrix.f + plane.offsetHeight / 2,
      angle: Math.atan2(matrix.b, matrix.a),
      width: rect.width,
      height: rect.height,
      inside:
        rect.left >= bounds.left - 1 &&
        rect.right <= bounds.right + 1 &&
        rect.top >= bounds.top - 1 &&
        rect.bottom <= bounds.bottom + 1,
    };
  });
}
async function home() {
  await page.goto(base);
  await page.evaluate(() => document.fonts.ready);
  await advance(120);
}
const separation = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const angleDifference = (a, b) =>
  Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base)).ok) break;
    } catch {}
    await delay(50);
  }
  await mkdir("test-results", { recursive: true });
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: "ko-KR",
  });
  await context.route("**/js/config.js", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: 'export const CONFIG={TOUR_API_SERVICE_KEY:"",KAKAO_JAVASCRIPT_KEY:""};',
    }),
  );
  page = await context.newPage();
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.url().startsWith(base) && response.status() >= 400)
      localResourceErrors.push(new URL(response.url()).pathname);
  });
  page.on("requestfailed", (request) => {
    if (request.failure()?.errorText !== "net::ERR_ABORTED")
      failedRequests.push({
        path: new URL(request.url()).pathname,
        error: request.failure()?.errorText,
      });
  });
  await page.clock.install({ time: new Date("2026-10-02T09:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-02T09:00:01Z"));
  await check(
    "01 기존 Main 구성·무드·여권·기능 링크 보존",
    async () => {
      await home();
      assert.match(await page.locator("#heroTitle").innerText(), /어디로/);
      assert.equal(await page.locator("#homeMoodChips .mood-chip").count(), 7);
      assert.equal(await page.locator(".journey-card").count(), 3);
      assert.deepEqual(
        await page
          .locator(".journey-card")
          .evaluateAll((nodes) =>
            nodes.map((node) => node.getAttribute("href")),
          ),
        ["./trip.html", "./plan.html", "./hotplace.html"],
      );
      assert.equal(await page.locator("#homePassportPreview").count(), 1);
      assert.ok((await page.locator(".hero").boundingBox()).height >= 800);
      assert.equal(await page.locator("#heroPlaneCanvas").count(), 1);
      assert.equal(
        await page.locator(".hero-art").getAttribute("aria-hidden"),
        "true",
      );
    },
  );
  await check("02 IDLE 14초 타원 순환·기수 진행 방향·경계 유지", async () => {
    const first = await sample();
    assert.equal(first.state, "IDLE");
    await advance(16);
    const next = await sample();
    assert.ok(separation(first, next) > 0);
    assert.ok(
      angleDifference(
        next.angle,
        Math.atan2(next.y - first.y, next.x - first.x),
      ) < 0.18,
      "nose follows the orbital tangent",
    );
    for (let i = 0; i < 13; i++) {
      await advance(1000);
      assert.ok(
        (await sample()).inside,
        "entire rotated aircraft stays inside hero",
      );
    }
    await advance(984);
    assert.ok(
      separation(first, await sample()) < 4,
      "one complete orbit lasts fourteen seconds",
    );
  });
  await check("03 pointerenter만으로는 추적하지 않음", async () => {
    await page
      .locator(".hero")
      .dispatchEvent("pointerenter", {
        pointerType: "mouse",
        clientX: 200,
        clientY: 300,
      });
    await advance(32);
    assert.equal((await sample()).state, "IDLE");
  });
  await check(
    "04 FOLLOW 보간·짧은 방향 회전·포인터 정지 후 RAF 종료",
    async () => {
      const before = await sample();
      await page
        .locator(".hero")
        .dispatchEvent("pointermove", {
          pointerType: "mouse",
          clientX: 300,
          clientY: 480,
        });
      await advance(16);
      const after = await sample();
      assert.equal(after.state, "FOLLOW");
      assert.ok(
        separation(before, after) < 90,
        "pointer motion cannot teleport the aircraft",
      );
      let previous = after;
      for (let i = 0; i < 12; i++) {
        await advance(16);
        const current = await sample();
        assert.ok(
          angleDifference(previous.angle, current.angle) < 0.6,
          "rotation takes the short path",
        );
        previous = current;
      }
      await advance(3500);
      const settled = await sample();
      assert.equal(settled.running, "false");
      await advance(600);
      assert.equal((await sample()).transform, settled.transform);
    },
  );
  await check("05 가장자리 추적 경계·CTA 클릭 가로막지 않음", async () => {
    const hero = await page.locator(".hero").boundingBox();
    for (const [x, y] of [
      [1, hero.y + 1],
      [1439, hero.y + 1],
      [1439, hero.y + hero.height - 1],
      [1, hero.y + hero.height - 1],
    ]) {
      await page
        .locator(".hero")
        .dispatchEvent("pointermove", {
          pointerType: "mouse",
          clientX: x,
          clientY: y,
        });
      await advance(2400);
      assert.ok((await sample()).inside);
    }
    const clickThrough = await page
      .locator(".explore-button")
      .evaluate((button) => {
        const bounds = button.getBoundingClientRect();
        return (
          document
            .elementFromPoint(
              bounds.x + bounds.width / 2,
              bounds.y + bounds.height / 2,
            )
            ?.closest(".explore-button") === button
        );
      });
    assert.equal(clickThrough, true);
    assert.equal(
      await page
        .locator("#heroPlane")
        .evaluate((node) => getComputedStyle(node).pointerEvents),
      "none",
    );
    assert.equal(
      await page
        .locator("#heroPlaneCanvas")
        .evaluate((node) => getComputedStyle(node).pointerEvents),
      "none",
    );
    await page.locator(".explore-button").click();
    assert.match(page.url(), /\/trip\.html$/);
    await home();
    await page
      .locator(".hero")
      .dispatchEvent("pointermove", {
        pointerType: "mouse",
        clientX: 300,
        clientY: 480,
      });
    await advance(2400);
  });
  await check("06 RETURN 위치 연속성과 IDLE 재개", async () => {
    const before = await sample();
    await page
      .locator(".hero")
      .dispatchEvent("pointerleave", { pointerType: "mouse" });
    await advance(16);
    const returning = await sample();
    assert.equal(returning.state, "RETURN");
    assert.ok(separation(before, returning) < 4);
    await advance(1480);
    const nearEnd = await sample();
    await advance(48);
    const resumed = await sample();
    assert.equal(resumed.state, "IDLE");
    assert.ok(
      separation(nearEnd, resumed) < 25,
      "return joins the orbit without jumping",
    );
  });
  await check("07 스크롤로 Hero를 벗어나면 중단·복귀 시 재개", async () => {
    await page.evaluate(() =>
      window.scrollTo({
        top: document.querySelector(".journey-section").offsetTop,
        behavior: "instant",
      }),
    );
    // IntersectionObserver uses the browser's rendering cycle, outside the virtual clock.
    await delay(100);
    await advance(200);
    const paused = await sample();
    assert.equal(paused.running, "false");
    await advance(800);
    assert.equal((await sample()).transform, paused.transform);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await delay(100);
    await advance(240);
    assert.equal((await sample()).running, "true");
  });
  await check("08 일부 스크롤된 Hero의 포인터 좌표 변환", async () => {
    await page.evaluate(() =>
      window.scrollTo({ top: 180, behavior: "instant" }),
    );
    await advance(80);
    await page
      .locator(".hero")
      .dispatchEvent("pointermove", {
        pointerType: "mouse",
        clientX: 700,
        clientY: 420,
      });
    await advance(2400);
    const expectedY = await page
      .locator(".hero")
      .evaluate(
        (node) =>
          420 -
          node.getBoundingClientRect().top -
          Math.min(
            document.querySelector("#heroPlane").offsetHeight * 0.25,
            42,
          ),
      );
    assert.ok(Math.abs((await sample()).y - expectedY) < 1);
    await page
      .locator(".hero")
      .dispatchEvent("pointerleave", { pointerType: "mouse" });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await advance(1700);
  });
  await check("09 탭 비활성·창 blur 중단 및 focus 복귀", async () => {
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        value: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    const paused = await sample();
    await advance(600);
    assert.equal((await sample()).transform, paused.transform);
    assert.equal((await sample()).running, "false");
    await page.evaluate(() => {
      delete document.hidden;
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await advance(100);
    assert.equal((await sample()).running, "true");
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    const blurred = await sample();
    await advance(500);
    assert.equal((await sample()).transform, blurred.transform);
    assert.equal((await sample()).running, "false");
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await advance(100);
    assert.equal((await sample()).running, "true");
  });
  await check("10 reduced-motion 정적 유지·실시간 환경 변경", async () => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await delay(100);
    await advance(32);
    const still = await sample();
    assert.equal(still.state, "STATIC");
    assert.equal(still.running, "false");
    assert.equal(still.transform, "none");
    await page
      .locator(".hero")
      .dispatchEvent("pointermove", {
        pointerType: "mouse",
        clientX: 300,
        clientY: 300,
      });
    await advance(1000);
    assert.equal((await sample()).transform, "none");
    assert.equal((await sample()).state, "STATIC");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await delay(100);
    await advance(100);
    assert.equal((await sample()).state, "IDLE");
  });
  await check(
    "11 데스크톱·태블릿·모바일 화면 폭과 터치 정적 화면",
    async () => {
      for (const width of [1920, 1440, 1024, 768, 390]) {
        await page.setViewportSize({ width, height: 1000 });
        await delay(100);
        await advance(100);
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          `${width}px horizontal overflow`,
        );
        assert.ok((await sample()).inside, `${width}px aircraft bounds`);
      }
      const mobile = await browser.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      });
      const mobilePage = await mobile.newPage();
      await mobilePage.goto(base);
      await mobilePage.evaluate(() => document.fonts.ready);
      assert.equal(
        await mobilePage.locator(".hero").getAttribute("data-flight-state"),
        "STATIC",
      );
      const before = await mobilePage
        .locator("#heroPlane")
        .evaluate((node) => getComputedStyle(node).transform);
      await mobilePage
        .locator(".hero")
        .dispatchEvent("pointermove", {
          pointerType: "touch",
          clientX: 180,
          clientY: 300,
        });
      assert.equal(
        await mobilePage
          .locator("#heroPlane")
          .evaluate((node) => getComputedStyle(node).transform),
        before,
      );
      assert.equal(
        await mobilePage.locator(".hero").getAttribute("data-flight-running"),
        "false",
      );
      await mobile.close();
    },
  );
  await check("12 런타임·콘솔·로컬 리소스 오류 없음", async () => {
    assert.deepEqual(runtimeErrors, []);
    assert.deepEqual(consoleErrors, []);
    assert.deepEqual(localResourceErrors, []);
    assert.deepEqual(failedRequests, []);
  });
} catch (error) {
  console.error(error);
  process.exitCode = 1;
  await page
    ?.screenshot({ path: "test-results/airplane-failure.png", fullPage: true })
    .catch(() => {});
} finally {
  await writeFile(
    "test-results/airplane-results.json",
    JSON.stringify(
      {
        results,
        runtimeErrors,
        consoleErrors,
        localResourceErrors,
        failedRequests,
      },
      null,
      2,
    ),
  );
  await browser?.close();
  server?.kill();
}

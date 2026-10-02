const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const port = 3197;
const base = `http://localhost:${port}`;
const server = spawn(process.execPath, ['backend/src/server.js'], { cwd: path.resolve(__dirname, '..'), env: { ...process.env, PORT: String(port) }, stdio: 'ignore', windowsHide: true });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function get(url) {
  const response = await fetch(base + url, { signal: AbortSignal.timeout(30000) });
  const data = await response.json(); assert.equal(response.status, 200, data.message || 'Unexpected response'); return data;
}
(async () => {
  try {
    for (let i = 0; i < 30; i++) { try { await get('/api/health'); break; } catch { await wait(100); } }
    const config = await get('/api/config'); assert.ok(config.kakaoMapKey); assert.ok(config.tourConfigured); assert.ok(!('tourApiKey' in config));
    const regions = await get('/api/tour/areas'); assert.ok(regions.items.length >= 17);
    const cities = await get('/api/tour/areas?areaCode=1'); assert.ok(cities.items.length > 0);
    const list = await get('/api/tour/list?areaCode=1&contentTypeId=12&numOfRows=2'); assert.ok(list.items.length > 0); assert.ok(list.total > 0);
    const place = list.items[0];
    const detail = await get(`/api/tour/detail?contentId=${place.contentid}&contentTypeId=${place.contenttypeid}`); assert.ok(detail.detail?.title);
    const search = await get('/api/tour/list?keyword=' + encodeURIComponent('경복궁')); assert.ok(search.items.length > 0);
    const results = await Promise.all(['14', '15', '25', '28', '32', '38', '39'].map((type) => get(`/api/tour/list?areaCode=1&contentTypeId=${type}&numOfRows=1`)));
    results.forEach((result) => assert.ok(Array.isArray(result.items)));
    for (const file of ['index', 'explore', 'planner', 'hotplace', 'community', 'mypage']) {
      const response = await fetch(`${base}/${file}.html`); assert.equal(response.status, 200); const text = await response.text(); assert.match(text, /charset="UTF-8"/); assert.ok(!text.includes('???'));
    }
    console.log('PASS: actual TourAPI regions, cities, 8 content types, keyword search, detail, config and 6 UTF-8 pages.');
    console.log(`Regions: ${regions.items.length}; Seoul attractions: ${list.total}; detail photos: ${detail.images.length}`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
  finally { server.kill(); }
})();

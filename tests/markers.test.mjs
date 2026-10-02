import test from 'node:test';
import assert from 'node:assert/strict';
import { MARKER_CATEGORIES, markerCategory, markerSpec, markerSVG, markerImageUrl } from '../js/map/marker-categories.js';

test('TourAPI의 8개 관광 유형은 각각 이름·색상·아이콘으로 구별된다', () => {
  const types = [12, 14, 15, 25, 28, 32, 38, 39];
  const labels = new Set(), colors = new Set(), icons = new Set();
  for (const type of types) {
    const category = markerCategory({ contenttypeid: type });
    assert.equal(category, String(type));
    const { label, color, icon } = MARKER_CATEGORIES[category];
    labels.add(label); colors.add(color); icons.add(icon);
    assert.match(color, /^#[0-9a-f]{6}$/i);
    assert.ok(icon.includes('<'));
  }
  assert.equal(labels.size, 8); assert.equal(colors.size, 8); assert.equal(icons.size, 8);
});

test('현재 HotPlace 유형 및 관광공사 연결 장소를 같은 마커 분류로 표시한다', () => {
  for (const [type, expected] of Object.entries({ 카페: '39', 음식점: '39', 자연: 'nature', 문화시설: '14', 숙소: '32', 명소: '12', 기타: 'other' })) {
    assert.equal(markerCategory({ type }), expected);
  }
  assert.equal(markerCategory({ type: '카페', touristPlace: { contenttypeid: '14' } }), '14');
  assert.equal(markerCategory({ contenttypeid: '12', type: '음식점' }), '12');
});

test('알 수 없는 유형을 이름으로 추측하지 않고 기타 장소로 표시한다', () => {
  for (const place of [null, {}, { contenttypeid: '999' }, { title: '맛있는 음식점' }, { type: '미등록 분류' }, { contenttypeid: '__proto__' }]) {
    assert.equal(markerCategory(place), 'other');
  }
});

test('선택·호버 핀이 확대되어도 뾰족한 끝은 같은 지도 좌표를 가리킨다', () => {
  const normal = markerSpec(), hover = markerSpec('hover'), selected = markerSpec('selected');
  assert.ok(normal.width < hover.width && hover.width < selected.width);
  for (const spec of [normal, hover, selected]) {
    assert.equal(spec.offsetX / spec.width, .5);
    assert.equal(spec.offsetY / spec.height, 45 / 48);
  }
  assert.deepEqual(markerSpec('unknown'), normal);
});

test('SVG는 선택 상태를 구분하면서 외부 URL이나 사용자 문자열을 삽입하지 않는다', () => {
  for (const type of Object.keys(MARKER_CATEGORIES)) {
    const normal = markerSVG(type), selected = markerSVG(type, 'selected');
    assert.notEqual(normal, selected);
    assert.ok(normal.includes(MARKER_CATEGORIES[type].color));
    assert.ok(selected.includes(MARKER_CATEGORIES[type].color));
    assert.doesNotMatch(normal, /<script|onload=|href=/i);
    const url = markerImageUrl(type);
    assert.ok(url.startsWith('data:image/svg+xml;charset=UTF-8,'));
    assert.equal(decodeURIComponent(url.split(',')[1]), normal);
  }
  assert.equal(markerSVG('<script>alert(1)</script>'), markerSVG('other'));
  assert.equal(markerSVG('__proto__'), markerSVG('other'));
});

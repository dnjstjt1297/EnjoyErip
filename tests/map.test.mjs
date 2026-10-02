import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setupDOM } from './helpers.mjs';
import { MARKER_CATEGORIES, markerCategory } from '../frontend/assets/js/marker-categories.js';
import { TravelMap } from '../frontend/assets/js/map.js';

test('category markers, hotplace fallback, legend updates and route interactions', async () => {
  setupDOM('explore');
  class Value { constructor(...args) { this.args = args; } }
  class Marker { constructor(options) { this.options = options; } setMap(map) { this.removed = map === null; } }
  class Bounds { extend() {} }
  class TestMap extends TravelMap {
    async initialize() {
      this.maps = { Marker, MarkerImage: Value, Size: Value, Point: Value, LatLng: Value, LatLngBounds: Bounds, Polyline: Marker, event: { addListener: (target, name, fn) => { target[name] = fn; } } };
      this.map = { setCenter() {}, setLevel() {}, setBounds() {}, panTo() {} };
      this.info = { close() {}, setContent() {}, setPosition() {}, open() {} };
      return true;
    }
  }
  let selected;
  const map = new TestMap('#map', { onSelect: (place) => { selected = place; } });
  const places = Object.keys(MARKER_CATEGORIES).filter((id) => /^\d+$/.test(id)).map((id) => ({ contenttypeid: id, title: `Place ${id}`, mapy: 37.5, mapx: 127 }));
  await map.setPlaces([...places, { title: 'Invalid coordinates', contenttypeid: '99', mapy: 0, mapx: 0 }], { route: true });
  assert.equal(map.markers.length, 8);
  assert.equal(new Set(map.markers.map((marker) => marker.options.image.args[0])).size, 8);
  assert.equal(map.legend.children.length, 8);
  assert.ok(map.line);
  map.markers[0].click();
  assert.equal(selected, places[0]);
  assert.match(map.markers[0].options.title, /^1\. /);
  for (const id of Object.keys(MARKER_CATEGORIES)) {
    const svg = readFileSync(new URL(`../frontend/assets/images/markers/${id}.svg`, import.meta.url), 'utf8');
    assert.ok(svg.includes(MARKER_CATEGORIES[id].color));
  }
  assert.equal(markerCategory({ touristPlace: { contenttypeid: '32' }, type: '관광지' }), '32');
  assert.equal(markerCategory({ type: '카페·음식점' }), '39');
  assert.equal(markerCategory({ type: '자연' }), 'nature');
  assert.equal(markerCategory({ contenttypeid: 'unknown' }), 'other');
  const previous = map.markers[0], line = map.line;
  await map.setPlaces([{ ...places[0], contenttypeid: '39' }]);
  assert.equal(previous.removed, true);
  assert.equal(line.removed, true);
  assert.equal(map.legend.textContent, '음식점');
  assert.equal(document.querySelectorAll('.map-legend').length, 1);
  await map.setPlaces([]);
  assert.equal(map.legend.hidden, true);
});

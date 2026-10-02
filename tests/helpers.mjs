import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';

export function setupDOM(page = 'index') {
  const html = readFileSync(new URL(`../frontend/${page}.html`, import.meta.url), 'utf8');
  const dom = new JSDOM(html, { url: `http://localhost:3000/${page}.html`, pretendToBeVisual: true });
  const { window } = dom;
  for (const key of ['window', 'document', 'localStorage', 'location', 'DOMParser', 'FormData', 'CustomEvent', 'Event', 'Blob']) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: key === 'window' ? window : window[key] });
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
  window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new window.Event('close')); };
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ kakaoMapKey: '', tourConfigured: true }) });
  return dom;
}
export function fill(values, prefix = 'auth-') {
  for (const [key, value] of Object.entries(values)) document.getElementById(prefix + key).value = value;
}
export function submit(id) { document.getElementById(id).dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); }
export async function waitFor(predicate, timeout = 4000) {
  const start = Date.now();
  while (!predicate()) { if (Date.now() - start > timeout) throw new Error('Timed out waiting for UI state'); await new Promise((resolve) => setTimeout(resolve, 15)); }
}

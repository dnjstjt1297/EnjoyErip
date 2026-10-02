export function escapeHtml(value = "") {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[char]);
}

export function safeImageUrl(value) {
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol)) return "";
    if (url.hostname.endsWith("visitkorea.or.kr")) url.protocol = "https:";
    return url.href;
  } catch { return ""; }
}

export function imageMarkup(url, title, className = "card-img-top") {
  const src = safeImageUrl(url);
  return src
    ? `<div class="place-media is-loading"><img src="${escapeHtml(src)}" class="${className}" alt="${escapeHtml(title)}" loading="lazy" decoding="async" referrerpolicy="no-referrer"></div>`
    : '<div class="place-media"><div class="image-placeholder" role="img" aria-label="등록된 사진 없음"><svg viewBox="0 0 64 48" fill="none" aria-hidden="true"><rect x="5" y="4" width="54" height="40" rx="9" stroke="currentColor" stroke-width="2"/><circle cx="42" cy="16" r="5" fill="currentColor" opacity=".4"/><path d="m8 38 16-18 13 15 7-8 13 13" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg><span>사진을 준비하고 있어요</span><small>ENJOY THE UNDISCOVERED</small></div></div>';
}

export function enableImageFallbacks(root = document) {
  root.querySelectorAll("img").forEach((img) => {
    if (img.dataset.fallbackReady) return;
    img.dataset.fallbackReady = "true";
    const media = img.closest(".place-media");
    const loaded = () => media?.classList.remove("is-loading");
    const failed = () => { (media || img).outerHTML = imageMarkup("", ""); };
    img.addEventListener("load", loaded, { once: true });
    img.addEventListener("error", failed, { once: true });
    if (img.complete) img.naturalWidth ? loaded() : failed();
  });
}

export function validCoordinates(lat, lng) {
  return lat !== "" && lng !== "" && lat != null && lng != null
    && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))
    && Math.abs(Number(lat)) <= 90 && Math.abs(Number(lng)) <= 180
    && !(Number(lat) === 0 && Number(lng) === 0);
}

export function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// Adapted from references/ssafy-kakao/js/common.js. DOM Option avoids HTML injection.
export function updateSelect(select, data, placeholder = `전체 ${select.dataset.type || "항목"}`) {
  select.replaceChildren(new Option(placeholder, ""));
  select.disabled = !data;
  if (data) select.append(...data.map((item) => new Option(item.label || item.name, item.key || item.code)));
}

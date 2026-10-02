// Small inline illustrations stay readable even when the device has no emoji font.
const icon = (body) => `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;

// Shortcuts to existing TourAPI filters, never inferred tags on individual places.
export const TRAVEL_MOODS = Object.freeze([
  { id: "rest", icon: icon('<path d="M5 18C-1 7 13 8 20 3c1 8-1 16-10 16M4 21 15 10"/>'), label: "쉬어가기", contentTypeId: "12", classification: "NA", description: "자연관광에 속한 여행지에서 잠시 쉬어가요." },
  { id: "food", icon: icon('<path d="M4 3v5a3 3 0 0 0 6 0V3M7 3v18M19 3c-3 1-4 4-4 9h4m0-9v18"/>'), label: "먹으러 가기", contentTypeId: "39", classification: "FD", description: "이 지역의 음식점을 만나보세요." },
  { id: "culture", icon: icon('<path d="M12 3a9 9 0 1 0 0 18c2 0 3-2 1-3s-1-4 2-4h2c6 0 4-11-5-11Z"/><circle cx="7" cy="10" r="1"/><circle cx="11" cy="7" r="1"/><circle cx="16" cy="8" r="1"/>'), label: "문화 즐기기", contentTypeId: "14", classification: "VE", description: "전시와 이야기가 있는 문화시설을 찾아요." },
  { id: "active", icon: icon('<circle cx="15" cy="4" r="2"/><path d="m4 10 5-3 5 3 5 1m-6-3-3 6 5 2 2 5M10 14l-3 5H3"/>'), label: "활동적으로", contentTypeId: "28", classification: "LS", description: "몸을 움직이며 즐기는 레포츠 여행이에요." },
  { id: "shopping", icon: icon('<path d="M5 8h14l1 13H4L5 8Zm3 0V6a4 4 0 0 1 8 0v2"/>'), label: "구경하고 쇼핑", contentTypeId: "38", classification: "SH", description: "시장에서 쇼핑 명소까지, 구경하는 재미를 찾아요." },
  { id: "festival", icon: icon('<path d="m3 21 5-13 8 8-13 5Zm5-13 1 11m-3-6 5 5m2-11 2-4m2 8 4-2m-3 6 3 2M8 3v1m11-1v2"/>'), label: "축제 즐기기", contentTypeId: "15", classification: "EV", description: "축제·공연·행사를 찾아요. 개최 일정은 상세 정보를 확인하세요." },
  { id: "random", icon: icon('<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M7 7h.01M17 7h.01M12 12h.01M7 17h.01M17 17h.01" stroke-width="3"/>'), label: "오늘 어디 가지?", description: "현재 검색 결과에서 한 곳을 골라드려요." },
]);

export function getMoodFilters(id, classifications = []) {
  const mood = TRAVEL_MOODS.find((item) => item.id === id);
  if (!mood || id === "random") return null;
  // The major code must be present in this API session's code catalog.
  return { contentTypeId: mood.contentTypeId,
    lclsSystm1: classifications.some((item) => String(item.code) === mood.classification) ? mood.classification : "",
    lclsSystm2: "", lclsSystm3: "" };
}

export function pickRandomPlace(items, random = Math.random) {
  if (!Array.isArray(items) || !items.length) return null;
  return items[Math.min(items.length - 1, Math.max(0, Math.floor(random() * items.length)))];
}

export function moodMarkup({ links = false } = {}) {
  return TRAVEL_MOODS.map((mood) => links
    ? `<a class="mood-chip" href="./trip.html?mood=${mood.id}"><span aria-hidden="true">${mood.icon}</span>${mood.label}</a>`
    : `<button type="button" class="mood-chip" data-mood="${mood.id}" aria-pressed="false"><span aria-hidden="true">${mood.icon}</span>${mood.label}</button>`).join("");
}

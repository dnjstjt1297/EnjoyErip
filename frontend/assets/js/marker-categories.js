// Shared by tourism, itinerary and hotplace maps.
export const MARKER_CATEGORIES = {
  12: { label: '관광지', color: '#087f91', icon: '<path d="m7 19 5-9 4 6 3-4 6 7Z"/><circle cx="22" cy="8" r="2"/>' },
  14: { label: '문화시설', color: '#7555c7', icon: '<path d="m7 10 9-5 9 5M8 12h16M10 12v10m6-10v10m6-10v10M7 24h18"/>' },
  15: { label: '축제·공연', color: '#d73982', icon: '<path d="M13 20V8l11-3v12M13 10l11-3"/><ellipse cx="10" cy="21" rx="3" ry="2"/><ellipse cx="21" cy="18" rx="3" ry="2"/>' },
  25: { label: '여행코스', color: '#2563c2', icon: '<circle cx="9" cy="8" r="3"/><circle cx="23" cy="23" r="3"/><path d="M9 11v5c0 4 14-2 14 4"/>' },
  28: { label: '레포츠', color: '#b85c12', icon: '<circle cx="18" cy="6" r="2"/><path d="m11 13 5-4 5 5h5M16 9l-3 9 7 3-2 6M13 18l-5 7"/>' },
  32: { label: '숙박', color: '#4556a8', icon: '<path d="M6 9v16m20-10v10M6 21h20M6 15h17a3 3 0 0 1 3 3v3"/><rect x="9" y="11" width="6" height="4" rx="1"/>' },
  38: { label: '쇼핑', color: '#ab4e96', icon: '<path d="M8 11h16l2 14H6ZM12 11V8a4 4 0 0 1 8 0v3"/>' },
  39: { label: '음식점', color: '#c74436', icon: '<path d="M8 5v7a3 3 0 0 0 6 0V5m-3 0v21M24 26V5c-5 2-5 9 0 10"/>' },
  nature: { label: '자연', color: '#287647', icon: '<path d="m16 5-8 9h4l-6 8h20l-6-8h4ZM16 22v5"/>' },
  other: { label: '기타 장소', color: '#596579', icon: '<circle cx="16" cy="15" r="6"/><circle cx="16" cy="15" r="1"/>' },
};
const HOTPLACE_TYPES = { '관광지': '12', '문화시설': '14', '축제·공연': '15', '여행코스': '25', '레포츠': '28', '숙박': '32', '쇼핑': '38', '음식점': '39', '카페·음식점': '39', '자연': 'nature' };
export function markerCategory(place) {
  const id = String(place.contenttypeid || place.touristPlace?.contenttypeid || HOTPLACE_TYPES[place.type] || 'other');
  return MARKER_CATEGORIES[id] ? id : 'other';
}
export function markerSVG(id) {
  const { color, icon } = MARKER_CATEGORIES[id] || MARKER_CATEGORIES.other;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="48" viewBox="0 0 40 48"><path fill="#000" opacity=".15" d="M21 3C11 3 3 11 3 21c0 13 18 27 18 27s18-14 18-27C39 11 31 3 21 3Z"/><path fill="${color}" stroke="#fff" stroke-width="2" d="M20 2C10 2 2 10 2 20c0 12 18 25 18 25s18-13 18-25C38 10 30 2 20 2Z"/><g transform="translate(4 3)" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${icon}</g></svg>`;
}

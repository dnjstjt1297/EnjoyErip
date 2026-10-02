export const TYPES = { 12: '관광지', 14: '문화시설', 15: '축제·공연', 25: '여행코스', 28: '레포츠', 32: '숙박', 38: '쇼핑', 39: '음식점' };
export async function api(path, params = {}, options = {}) {
  const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== '' && value !== undefined && value !== null));
  const response = await fetch(`/api/${path}${query.size ? '?' + query : ''}`, options);
  let data;
  try { data = await response.json(); } catch { throw new Error('서버에 연결할 수 없습니다. npm start로 실행한 주소를 열어 주세요.'); }
  if (!response.ok) throw new Error(data.message || '요청을 처리할 수 없습니다.');
  return data;
}
export function compactPlace(item) {
  return { contentid: String(item.contentid), contenttypeid: String(item.contenttypeid || ''), areacode: String(item.areacode || ''), sigungucode: String(item.sigungucode || ''), title: String(item.title || '이름 없는 장소'), addr1: String(item.addr1 || ''), mapx: Number(item.mapx || 0), mapy: Number(item.mapy || 0), firstimage: String(item.firstimage || item.firstimage2 || '') };
}

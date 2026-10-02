export const DB_KEY = 'enjoytrip.db.v1';
const SESSION_KEY = 'enjoytrip.session.v1';
const emptyDB = () => ({ version: 1, users: [], plans: [], favorites: [], hotplaces: [], posts: [] });
export const uid = () => crypto.randomUUID();

export function readDB() {
  let text;
  try { text = localStorage.getItem(DB_KEY); } catch { throw new Error('브라우저 저장소에 접근할 수 없습니다. 저장소 설정을 확인해 주세요.'); }
  if (!text) return emptyDB();
  let db;
  try { db = JSON.parse(text); } catch { throw new Error('저장된 데이터를 읽을 수 없습니다. 마이페이지에서 백업 파일을 확인해 주세요.'); }
  if (db.version !== 1 || !['users', 'plans', 'favorites', 'hotplaces', 'posts'].every((key) => Array.isArray(db[key]))) throw new Error('저장된 데이터 형식이 올바르지 않습니다.');
  return db;
}
export function writeDB(db) {
  try { localStorage.setItem(DB_KEY, JSON.stringify(db)); }
  catch { throw new Error('저장 공간이 부족하거나 저장소를 사용할 수 없습니다. 사진 크기를 줄이거나 데이터를 백업해 주세요.'); }
  window.dispatchEvent(new CustomEvent('dbchange'));
}
export function mutateDB(change) {
  const db = readDB();
  const result = change(db);
  writeDB(db);
  return result;
}
export function currentUser() {
  let id;
  try { id = localStorage.getItem(SESSION_KEY); } catch { return null; }
  return id ? readDB().users.find((user) => user.id === id) || null : null;
}
export function setSession(id) {
  try { if (id) localStorage.setItem(SESSION_KEY, id); else localStorage.removeItem(SESSION_KEY); }
  catch { throw new Error('로그인 상태를 저장할 수 없습니다. 브라우저 저장소를 확인해 주세요.'); }
  window.dispatchEvent(new CustomEvent('authchange'));
}
export function ownedItems(collection) {
  const user = currentUser();
  return user ? readDB()[collection].filter((item) => item.userId === user.id) : [];
}
export function saveOwned(collection, item) {
  const user = currentUser();
  if (!user) throw new Error('로그인 후 이용해 주세요.');
  return mutateDB((db) => {
    const index = db[collection].findIndex((entry) => entry.id === item.id);
    if (index >= 0 && db[collection][index].userId !== user.id) throw new Error('작성자만 수정할 수 있습니다.');
    const value = { ...item, id: item.id || uid(), userId: user.id, updatedAt: new Date().toISOString(), createdAt: index >= 0 ? db[collection][index].createdAt : new Date().toISOString() };
    if (index < 0) db[collection].push(value); else db[collection][index] = value;
    return value;
  });
}
export function deleteOwned(collection, id) {
  const user = currentUser();
  if (!user) throw new Error('로그인 후 이용해 주세요.');
  mutateDB((db) => {
    const index = db[collection].findIndex((item) => item.id === id && item.userId === user.id);
    if (index < 0) throw new Error('작성자만 삭제할 수 있습니다.');
    db[collection].splice(index, 1);
  });
}
export function addPlanPlace(place) {
  const user = currentUser();
  if (!user) throw new Error('로그인 후 여행을 계획해 주세요.');
  return mutateDB((db) => {
    let plan = db.plans.find((item) => item.userId === user.id && item.draft);
    if (!plan) {
      plan = { id: uid(), userId: user.id, name: '나의 새로운 여행', startDate: '', days: 1, budget: 0, note: '', places: [], draft: true, createdAt: new Date().toISOString() };
      db.plans.push(plan);
    }
    if (plan.places.some((item) => item.contentid === place.contentid)) throw new Error('이미 여행 계획에 담은 장소입니다.');
    plan.places.push({ ...place, day: 1, time: '09:00', cost: 0, note: '' });
    return plan;
  });
}
export async function hashSecret(secret, salt) {
  if (!crypto.subtle) throw new Error('회원 기능은 localhost 또는 HTTPS 주소에서 이용해 주세요.');
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), 'PBKDF2', false, ['deriveBits']);
  const bytes = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: 120000, hash: 'SHA-256' }, material, 256);
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

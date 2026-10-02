export const STORAGE_KEYS = {
  USERS: "enjoytrip_users",
  CURRENT_USER: "enjoytrip_current_user",
  PLANS: "enjoytrip_plans",
  HOTPLACES: "enjoytrip_hotplaces",
  DRAFTS: "enjoytrip_plan_drafts",
  REGIONS: "enjoytrip_regions",
  VISITS: "enjoytrip_visits",
};

export function readJson(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (error) {
    throw new Error("저장된 데이터를 읽을 수 없습니다. 브라우저의 저장소 설정을 확인하세요. 기존 데이터는 덮어쓰지 않았습니다.", { cause: error });
  }
}

export function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    throw new Error("저장 공간이 부족하거나 저장이 차단되어 있습니다. 브라우저 설정을 확인하세요.", { cause: error });
  }
}

export function remove(key) {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    throw new Error("저장된 데이터를 삭제할 수 없습니다.", { cause: error });
  }
}

export function readArray(key) {
  const value = readJson(key, []);
  if (!Array.isArray(value) || value.some((item) => !item || typeof item !== "object")) {
    throw new Error("저장 데이터 형식이 올바르지 않습니다. 기존 데이터는 덮어쓰지 않았습니다.");
  }
  return value;
}

export function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

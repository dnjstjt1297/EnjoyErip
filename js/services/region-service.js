import { fetchAreaCodes, extractItems } from "../api/tour-api.js";
import { STORAGE_KEYS, readArray, writeJson } from "./storage-service.js";

let pending;

function normalizeRegions(items, allowEmpty = false) {
  if (!Array.isArray(items) || (!allowEmpty && !items.length)) {
    throw new Error("지역 목록을 확인할 수 없습니다. 잠시 후 다시 불러오세요.");
  }
  const codes = new Set();
  return items.map((item) => {
    const code = String(item?.code ?? "").trim();
    const name = String(item?.name ?? "").trim();
    if (!/^\d{2,10}$/.test(code) || !name || name.length > 60 || codes.has(code)) {
      throw new Error("지역 목록 형식이 올바르지 않습니다. 기존 목록은 변경하지 않았습니다.");
    }
    codes.add(code);
    return { code, name };
  });
}

// The catalog comes from ldongCode2, including its full (sometimes five-digit) codes.
// Do not replace it with the legacy areaCode list or a fixed 17-region denominator.
export function rememberRegions(items) {
  const regions = normalizeRegions(items);
  writeJson(STORAGE_KEYS.REGIONS, regions);
  return regions;
}

export function getRegions() {
  return normalizeRegions(readArray(STORAGE_KEYS.REGIONS), true);
}

export async function loadRegions() {
  if (!pending) {
    pending = (async () => {
      try {
        return rememberRegions(extractItems(await fetchAreaCodes()));
      } catch (error) {
        const cached = getRegions();
        if (cached.length) return cached;
        throw error;
      }
    })().finally(() => { pending = undefined; });
  }
  return pending;
}

const normalizedName = (name) => String(name ?? "").trim()
  .replace(/(?:특별자치시|특별자치도|광역시|특별시|도)$/, "");

export function resolveRegion(place, regions = getRegions()) {
  const code = String(place?.lDongRegnCd ?? "").trim();
  const exact = regions.find((region) => region.code === code);
  if (exact) return { ...exact };
  // Older saved plans have an address but no statutory region code. Only a
  // unique exact name match is safe; unknown/retired names need user selection.
  const token = normalizedName(String(place?.addr1 ?? "").trim().split(/\s+/)[0]);
  if (!token) return null;
  const matches = regions.filter((region) => normalizedName(region.name) === token);
  return matches.length === 1 ? { ...matches[0] } : null;
}

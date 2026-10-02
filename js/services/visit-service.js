import { STORAGE_KEYS, readArray, writeJson } from "./storage-service.js";
import { getCurrentUser, requireUser } from "./auth-service.js";
import { getRegions } from "./region-service.js";
import { safeImageUrl, validDate, today } from "../ui/helpers.js";

function identity(source, sourceId) {
  const id = String(sourceId ?? "").trim();
  if (!["tour", "hotplace"].includes(source) || !id || id.length > 128) {
    throw new Error("방문할 장소 정보를 확인하세요.");
  }
  return { source, sourceId: id };
}

function notifyVisitsChange() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("visitschange"));
}

export function getVisits() {
  const user = getCurrentUser();
  return user ? readArray(STORAGE_KEYS.VISITS).filter((visit) => visit.ownerId === user.id) : [];
}

export function getVisit(source, sourceId) {
  return getVisits().find((visit) => visit.source === source && visit.sourceId === String(sourceId));
}

export function markVisited(input) {
  const ownerId = requireUser().id;
  const key = identity(input.source, input.sourceId);
  const visits = readArray(STORAGE_KEYS.VISITS);
  const existing = visits.find((visit) => visit.ownerId === ownerId
    && visit.source === key.source && visit.sourceId === key.sourceId);
  // One stamp per place and member. A repeated click never rewrites its date.
  if (existing) return existing;
  const title = String(input.title ?? "").trim();
  if (!title || title.length > 200) throw new Error("장소명은 1~200자로 입력하세요.");
  const region = getRegions().find((item) => item.code === String(input.regionCode ?? ""));
  if (!region) throw new Error("지역 목록에서 방문한 지역을 선택하세요.");
  if (!validDate(input.visitedAt) || input.visitedAt > today()) {
    throw new Error("방문일은 오늘 또는 이전 날짜로 입력하세요.");
  }
  const record = {
    ownerId, ...key, title, regionCode: region.code, regionName: region.name,
    visitedAt: input.visitedAt, addr1: String(input.addr1 ?? "").trim().slice(0, 1000),
    imageUrl: safeImageUrl(input.imageUrl), createdAt: new Date().toISOString(),
  };
  writeJson(STORAGE_KEYS.VISITS, [...visits, record]);
  notifyVisitsChange();
  return record;
}

export function removeVisit(source, sourceId) {
  const ownerId = requireUser().id;
  const key = identity(source, sourceId);
  const visits = readArray(STORAGE_KEYS.VISITS);
  const remaining = visits.filter((visit) => !(visit.ownerId === ownerId
    && visit.source === key.source && visit.sourceId === key.sourceId));
  if (remaining.length === visits.length) return false;
  writeJson(STORAGE_KEYS.VISITS, remaining);
  notifyVisitsChange();
  return true;
}

export function getVisitStats(regions = getRegions()) {
  const visits = getVisits();
  const counts = new Map();
  for (const visit of visits) {
    const region = counts.get(visit.regionCode) ?? {
      code: visit.regionCode, name: visit.regionName, count: 0, lastVisited: "",
    };
    region.count += 1;
    if (visit.visitedAt > region.lastVisited) region.lastVisited = visit.visitedAt;
    counts.set(region.code, region);
  }
  const catalog = regions.map((region) => ({
    ...region, count: counts.get(region.code)?.count ?? 0,
    lastVisited: counts.get(region.code)?.lastVisited ?? "",
  }));
  const unassignedRegions = [...counts.values()]
    .filter((region) => !regions.some((item) => item.code === region.code));
  const top = [...catalog, ...unassignedRegions]
    .filter((region) => region.count > 0)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ko"))[0];
  return {
    visitedPlaces: visits.length,
    visitedRegions: catalog.filter((region) => region.count > 0).length,
    totalRegions: regions.length,
    thisMonth: visits.filter((visit) => visit.visitedAt.startsWith(today().slice(0, 7))).length,
    topRegion: top ? { name: top.name, count: top.count } : null,
    regions: catalog,
    unassignedRegions,
  };
}

import { STORAGE_KEYS, readArray, writeJson, createId } from "./storage-service.js";
import { getCurrentUser, requireUser } from "./auth-service.js";
import { validDate, safeImageUrl } from "../ui/helpers.js";

export function getPlans() {
  const user = getCurrentUser();
  return user ? readArray(STORAGE_KEYS.PLANS).filter((plan) => plan.ownerId === user.id) : [];
}

export function savePlan(plan) {
  const ownerId = requireUser().id;
  const title = String(plan.title ?? "").trim();
  if (!title || title.length > 100) throw new Error("여행 제목은 1~100자로 입력하세요.");
  if (!validDate(plan.date)) throw new Error("여행 날짜를 입력하세요.");
  if (!Array.isArray(plan.places) || !plan.places.length) throw new Error("여행지를 한 곳 이상 추가하세요.");
  const budget = Number(plan.budget || 0);
  if (!Number.isFinite(budget) || budget < 0 || budget > 1000000000) throw new Error("예산은 0~10억 원으로 입력하세요.");
  const notes = String(plan.notes ?? "").trim();
  if (notes.length > 2000) throw new Error("상세 계획은 2,000자 이내로 입력하세요.");
  const plans = readArray(STORAGE_KEYS.PLANS);
  const index = plan.id ? plans.findIndex((item) => item.id === plan.id && item.ownerId === ownerId) : -1;
  if (plan.id && index < 0) throw new Error("수정할 여행계획을 찾을 수 없습니다.");
  const record = {
    id: plan.id || createId(), ownerId, title, date: plan.date, budget, notes,
    places: plan.places.map(placeSnapshot),
    createdAt: index >= 0 ? plans[index].createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  if (index >= 0) plans[index] = record;
  else plans.push(record);
  writeJson(STORAGE_KEYS.PLANS, plans);
  return record;
}

function placeSnapshot(place) {
  if (!place?.contentid || !place.title) throw new Error("여행지 정보가 올바르지 않습니다.");
  return {
    contentid: String(place.contentid), title: String(place.title), addr1: String(place.addr1 || ""),
    contenttypeid: String(place.contenttypeid || ""), mapx: String(place.mapx ?? ""), mapy: String(place.mapy ?? ""),
    lDongRegnCd: String(place.lDongRegnCd || ""), lDongSignguCd: String(place.lDongSignguCd || ""),
    firstimage: safeImageUrl(place.firstimage || place.firstimage2),
  };
}

export function deletePlan(id) {
  const ownerId = requireUser().id;
  const plans = readArray(STORAGE_KEYS.PLANS);
  if (!plans.some((plan) => plan.id === id && plan.ownerId === ownerId)) throw new Error("삭제할 여행계획을 찾을 수 없습니다.");
  writeJson(STORAGE_KEYS.PLANS, plans.filter((plan) => !(plan.id === id && plan.ownerId === ownerId)));
  if (getDraft().editingId === id) clearDraft();
}

export function getDraft() {
  const ownerId = requireUser().id;
  return readArray(STORAGE_KEYS.DRAFTS).find((draft) => draft.ownerId === ownerId)
    ?? { ownerId, title: "", date: "", budget: "", notes: "", places: [], editingId: "" };
}

export function updateDraft(patch) {
  const current = getDraft();
  const drafts = readArray(STORAGE_KEYS.DRAFTS);
  const next = { ...current };
  for (const key of ["title", "date", "budget", "notes", "editingId"]) {
    if (Object.hasOwn(patch, key)) next[key] = patch[key];
  }
  if (patch.places) next.places = patch.places.map(placeSnapshot);
  writeJson(STORAGE_KEYS.DRAFTS, [...drafts.filter((draft) => draft.ownerId !== current.ownerId), next]);
  return next;
}

export function clearDraft() {
  const ownerId = requireUser().id;
  writeJson(STORAGE_KEYS.DRAFTS, readArray(STORAGE_KEYS.DRAFTS).filter((draft) => draft.ownerId !== ownerId));
}

export function addDraftPlace(place) {
  const draft = getDraft();
  if (draft.places.some((item) => String(item.contentid) === String(place.contentid))) throw new Error("이미 여행계획에 담은 장소입니다.");
  if (draft.places.length >= 50) throw new Error("한 여행에는 최대 50곳을 담을 수 있습니다.");
  return updateDraft({ places: [...draft.places, placeSnapshot(place)] });
}

export function removeDraftPlace(id) {
  return updateDraft({ places: getDraft().places.filter((place) => place.contentid !== String(id)) });
}

export function moveDraftPlace(from, to) {
  const places = [...getDraft().places];
  if (![from, to].every((index) => Number.isInteger(index) && index >= 0 && index < places.length)) return;
  const [place] = places.splice(from, 1);
  places.splice(to, 0, place);
  return updateDraft({ places });
}

export function editPlan(id) {
  const plan = getPlans().find((item) => item.id === id);
  if (!plan) throw new Error("여행계획을 찾을 수 없습니다.");
  return updateDraft({ ...plan, editingId: plan.id });
}

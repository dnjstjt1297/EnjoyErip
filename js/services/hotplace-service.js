import { STORAGE_KEYS, readArray, writeJson, createId } from "./storage-service.js";
import { getCurrentUser, requireUser } from "./auth-service.js";
import { safeImageUrl, validCoordinates, validDate, today } from "../ui/helpers.js";
import { safePhotoData } from "../ui/hotplace-photo.js";

export function getHotplaces() {
  const user = getCurrentUser();
  return user ? readArray(STORAGE_KEYS.HOTPLACES).filter((place) => place.ownerId === user.id) : [];
}

export function saveHotplace(place) {
  const ownerId = requireUser().id;
  const name = String(place.name ?? "").trim();
  const type = String(place.type ?? "").trim();
  const description = String(place.description ?? "").trim();
  if (!name || name.length > 100) throw new Error("장소명은 1~100자로 입력하세요.");
  if (!validDate(place.date) || place.date > today()) throw new Error("방문일은 오늘 또는 이전 날짜로 입력하세요.");
  if (!type || type.length > 30) throw new Error("장소유형을 입력하세요.");
  if (!description || description.length > 2000) throw new Error("설명은 1~2,000자로 입력하세요.");
  if (!validCoordinates(place.mapy, place.mapx)) throw new Error("지도에서 위치를 선택하거나 올바른 위도·경도를 입력하세요.");
  const imageUrl = safeImageUrl(place.imageUrl);
  if (place.imageUrl && !imageUrl) throw new Error("이미지는 http 또는 https URL을 입력하세요.");
  const places = readArray(STORAGE_KEYS.HOTPLACES);
  const index = place.id ? places.findIndex((item) => item.id === place.id && item.ownerId === ownerId) : -1;
  if (place.id && index < 0) throw new Error("수정할 장소를 찾을 수 없습니다.");
  const previous = index >= 0 ? places[index] : {};
  const address = String(place.address ?? previous.address ?? "").trim();
  if (address.length > 150) throw new Error("주소는 150자 이내로 입력하세요.");
  const photoInput = Object.hasOwn(place, "photo") ? place.photo : previous.photo;
  const photo = safePhotoData(photoInput);
  if (photoInput && !photo) throw new Error("JPEG, PNG, WebP 형식의 압축된 사진만 저장할 수 있습니다.");
  const touristPlace = tourSnapshot(Object.hasOwn(place, "touristPlace") ? place.touristPlace : previous.touristPlace);
  const record = { id: place.id || createId(), ownerId, name, type, description, date: place.date,
    imageUrl, address, photo, touristPlace, mapx: Number(place.mapx), mapy: Number(place.mapy),
    updatedAt: new Date().toISOString(),
    createdAt: index >= 0 ? places[index].createdAt : new Date().toISOString() };
  if (index >= 0) places[index] = record;
  else places.push(record);
  writeJson(STORAGE_KEYS.HOTPLACES, places);
  return record;
}

function tourSnapshot(place) {
  if (!place) return null;
  if (!place.contentid || !place.title) throw new Error("연결할 관광지 정보를 확인하세요.");
  return { contentid: String(place.contentid), title: String(place.title).slice(0, 200),
    contenttypeid: String(place.contenttypeid || ""), addr1: String(place.addr1 || "").slice(0, 150),
    firstimage: safeImageUrl(place.firstimage || place.firstimage2),
    mapx: String(place.mapx ?? ""), mapy: String(place.mapy ?? ""),
    lDongRegnCd: String(place.lDongRegnCd || ""), lDongSignguCd: String(place.lDongSignguCd || ""),
    lclsSystm1: String(place.lclsSystm1 || ""),
  };
}

export function deleteHotplace(id) {
  const ownerId = requireUser().id;
  const places = readArray(STORAGE_KEYS.HOTPLACES);
  if (!places.some((place) => place.id === id && place.ownerId === ownerId)) throw new Error("삭제할 장소를 찾을 수 없습니다.");
  writeJson(STORAGE_KEYS.HOTPLACES, places.filter((place) => !(place.id === id && place.ownerId === ownerId)));
}

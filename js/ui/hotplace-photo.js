import { escapeHtml, imageMarkup } from "./helpers.js";

// Uploaded photos have their own narrow allowlist. General image URL validation
// remains HTTP(S)-only, so SVG/data documents cannot enter normal API cards.
export function safePhotoData(value) {
  return typeof value === "string" && value.length <= 700000
    && /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)
    ? value : "";
}

export function photoMarkup(photo, imageUrl, title) {
  const data = safePhotoData(photo);
  return data
    ? `<div class="place-media is-loading"><img src="${data}" alt="${escapeHtml(title)}" loading="lazy" decoding="async"></div>`
    : imageMarkup(imageUrl, title);
}

// Based on Wonseok's upload flow: decode locally, fit within 1000 px, JPEG .76.
export async function compressPhoto(file) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file?.type)) {
    throw new Error("JPEG, PNG, WebP 사진만 등록할 수 있어요.");
  }
  if (file.size > 5 * 1024 * 1024) throw new Error("사진은 5MB 이하로 선택해 주세요.");
  let bitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw new Error("사진을 읽지 못했어요. 다른 사진을 선택해 주세요."); }
  try {
    if (!bitmap.width || !bitmap.height) throw new Error("사진 크기를 확인할 수 없습니다.");
    const ratio = Math.min(1, 1000 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("이 브라우저에서 사진을 처리할 수 없습니다.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const result = canvas.toDataURL("image/jpeg", .76);
    if (!safePhotoData(result)) throw new Error("사진을 더 작게 압축한 뒤 선택해 주세요. 저장 가능한 크기를 초과했습니다.");
    return result;
  } finally { bitmap.close(); }
}

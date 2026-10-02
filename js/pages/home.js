import { initAuth } from "../ui/auth.js";
import { moodMarkup } from "../ui/travel-moods.js";
import { getCurrentUser } from "../services/auth-service.js";
import { getRegions, loadRegions } from "../services/region-service.js";
import { getVisitStats } from "../services/visit-service.js";
import { escapeHtml } from "../ui/helpers.js";
initAuth();
document.getElementById("homeMoodChips").innerHTML = moodMarkup({ links: true });

// Wonseok's travel collage: animate only while the pointer position is settling.
const hero = document.querySelector(".hero");
const art = document.querySelector(".hero-art");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const finePointer = matchMedia("(hover: hover) and (pointer: fine)");
let targetX = 0, targetY = 0, currentX = 0, currentY = 0, motionFrame = 0;
function animateArt() {
  currentX += (targetX - currentX) * .09;
  currentY += (targetY - currentY) * .09;
  art.style.setProperty("--travel-x", `${currentX.toFixed(2)}px`);
  art.style.setProperty("--travel-y", `${currentY.toFixed(2)}px`);
  motionFrame = Math.abs(targetX - currentX) + Math.abs(targetY - currentY) > .05 ? requestAnimationFrame(animateArt) : 0;
}
function resetArt() {
  cancelAnimationFrame(motionFrame);
  motionFrame = targetX = targetY = currentX = currentY = 0;
  art.style.setProperty("--travel-x", "0px"); art.style.setProperty("--travel-y", "0px");
}
hero.addEventListener("pointermove", (event) => {
  if (reducedMotion.matches || !finePointer.matches || event.pointerType === "touch") return;
  const bounds = hero.getBoundingClientRect();
  targetX = ((event.clientX - bounds.left) / bounds.width - .5) * 36;
  targetY = ((event.clientY - bounds.top) / bounds.height - .5) * 28;
  if (!motionFrame) motionFrame = requestAnimationFrame(animateArt);
}, { passive: true });
hero.addEventListener("pointerleave", resetArt);
reducedMotion.addEventListener("change", resetArt);
finePointer.addEventListener("change", resetArt);
window.addEventListener("blur", resetArt);
document.addEventListener("visibilitychange", () => { if (document.hidden) resetArt(); });

let renderVersion = 0;
async function renderPassportPreview() {
  const version = ++renderVersion;
  const user = getCurrentUser();
  document.getElementById("homePassportPreview").hidden = !user;
  if (!user) return;
  let regions = getRegions();
  if (!regions.length) { try { regions = await loadRegions(); } catch { /* Existing records stay usable offline. */ } }
  if (version !== renderVersion) return;
  const stats = getVisitStats(regions);
  document.getElementById("homePassportSummary").innerHTML = `<span class="eyebrow">${escapeHtml(user.name)}님의 여행 기록</span><div class="preview-stat"><strong>${stats.visitedPlaces}</strong><span>다녀온 장소</span></div><div class="preview-stat"><strong>${stats.visitedRegions}<small> / ${stats.totalRegions || "—"}</small></strong><span>기록한 지역</span></div><p class="small text-secondary mb-0">${stats.visitedPlaces ? "다음에는 아직 가보지 않은 지역으로 떠나볼까요?" : "첫 여행을 기다리고 있어요. 다녀온 장소에서 ‘다녀왔어요’를 눌러보세요."}</p>`;
}
const refresh = () => renderPassportPreview().catch(() => { document.getElementById("homePassportSummary").textContent = "저장된 여행 기록을 읽지 못했습니다. 여행 여권에서 확인해 주세요."; });
window.addEventListener("authchange", refresh);
window.addEventListener("visitschange", refresh);
refresh();

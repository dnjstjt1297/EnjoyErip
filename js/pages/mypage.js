import { initAuth } from "../ui/auth.js";
import { getCurrentUser, updateCurrentUser, deleteCurrentUser } from "../services/auth-service.js";
import { showMessage } from "../ui/toast.js";
import { getPlans, getDraft } from "../services/plan-service.js";
import { getHotplaces } from "../services/hotplace-service.js";
import { getVisits } from "../services/visit-service.js";

initAuth();
const $ = (id) => document.getElementById(id);
function renderProfile() {
  try {
    const current = getCurrentUser();
    $("profileLoginNotice").hidden = Boolean(current);
    $("profileCard").hidden = !current;
    $("profileForm").reset();
    $("profileError").hidden = true;
    if (!current) return;
    $("profileId").value = current.id;
    $("profileName").value = current.name;
    $("profileEmail").value = current.email;
    $("profileDisplayName").textContent = `${current.name}님`;
    $("profileDisplayEmail").textContent = `${current.id} · ${current.email}`;
    $("profileAvatar").textContent = current.name.slice(0, 1);
    $("accountStats").innerHTML = [
      ["여행계획", getPlans().length, "plan.html"],
      ["다녀온 장소", getVisits().length, "passport.html"],
      ["HotPlace", getHotplaces().length, "hotplace.html"],
    ].map(([label, count, href]) => `<a href="./${href}"><strong>${count}</strong><span>${label}</span></a>`).join("");
  } catch (error) { showMessage(error.message, "danger"); }
}
$("profileForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('[type="submit"]');
  button.disabled = true;
  $("profileError").hidden = true;
  try {
    const password = $("profilePassword").value;
    const passwordConfirm = $("profilePasswordConfirm").value;
    const currentPassword = $("profileCurrentPassword").value;
    if ((currentPassword || passwordConfirm) && !password) throw new Error("새 비밀번호를 입력하세요.");
    await updateCurrentUser({ name: $("profileName").value, email: $("profileEmail").value, password, passwordConfirm, currentPassword });
    showMessage("회원정보를 수정했습니다.", "success");
  } catch (error) { $("profileError").textContent = error.message; $("profileError").hidden = false; showMessage(error.message, "danger"); }
  finally { button.disabled = false; }
});
$("exportData").addEventListener("click", () => {
  try {
    const current = getCurrentUser();
    if (!current) throw new Error("로그인 후 내 데이터를 백업할 수 있습니다.");
    const backup = {
      version: 1, exportedAt: new Date().toISOString(),
      profile: { id: current.id, name: current.name, email: current.email },
      plans: getPlans(), draft: getDraft(), hotplaces: getHotplaces(), visits: getVisits(),
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url; link.download = "enjoytrip-my-data.json";
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showMessage("내 여행 데이터를 백업했습니다.", "success");
  } catch (error) { showMessage(error.message, "danger"); }
});
$("deleteAccountBtn").addEventListener("click", () => {
  if (!confirm("회원정보와 이 계정의 여행계획·HotPlace·여행 여권 방문 기록을 모두 삭제하고 탈퇴할까요?")) return;
  try { deleteCurrentUser(); showMessage("회원 탈퇴가 완료되었습니다.", "success"); }
  catch (error) { showMessage(error.message, "danger"); }
});
window.addEventListener("authchange", renderProfile);
renderProfile();

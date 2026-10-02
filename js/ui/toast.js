export function showMessage(message, type = "info") {
  document.querySelectorAll(".app-toast").forEach((element) => element.remove());
  const toast = document.createElement("div");
  toast.className = `app-toast toast-${type}`;
  toast.setAttribute("role", type === "danger" || type === "warning" ? "alert" : "status");
  const icon = document.createElement("span");
  icon.className = "toast-symbol"; icon.setAttribute("aria-hidden", "true");
  icon.textContent = type === "success" ? "✓" : type === "warning" || type === "danger" ? "!" : "i";
  const text = document.createElement("span"); text.textContent = message;
  const close = document.createElement("button");
  close.type = "button"; close.className = "btn-close"; close.setAttribute("aria-label", "알림 닫기");
  toast.append(icon, text, close); document.body.appendChild(toast);
  let timer;
  const dismiss = () => { clearTimeout(timer); toast.classList.add("is-leaving"); setTimeout(() => toast.remove(), 180); };
  close.addEventListener("click", dismiss);
  timer = setTimeout(dismiss, 5000);
}

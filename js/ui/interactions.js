// Small, shared enhancements. Content stays visible without the observer.
let observer;
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
export function scrollToElement(element, block = "nearest") {
  element?.scrollIntoView({ behavior: reducedMotion() ? "instant" : "smooth", block });
}
export function revealElements(root = document) {
  if (!observer || reducedMotion()) return;
  root.querySelectorAll("[data-reveal]").forEach((element, index) => {
    if (element.dataset.observed) return;
    element.dataset.observed = "true";
    element.style.setProperty("--reveal-delay", `${Math.min(index % 4, 3) * 65}ms`);
    element.classList.add("reveal-pending");
    observer.observe(element);
  });
}
export function initInteractions() {
  // Bootstrap ignores hide() while its opening transition is running. Queue an
  // early close click so a fast click on the visible close button is never lost.
  document.addEventListener("show.bs.modal", ({ target }) => { target.dataset.entering = "true"; });
  document.addEventListener("shown.bs.modal", ({ target }) => { delete target.dataset.entering; });
  document.addEventListener("click", (event) => {
    const button = event.target.closest('[data-bs-dismiss="modal"]');
    const modal = button?.closest(".modal");
    if (!modal?.dataset.entering) return;
    event.preventDefault(); event.stopPropagation();
    if (modal.dataset.closePending) return;
    modal.dataset.closePending = "true";
    modal.addEventListener("shown.bs.modal", () => {
      delete modal.dataset.closePending;
      bootstrap.Modal.getInstance(modal)?.hide();
    }, { once: true });
  }, true);
  const nav = document.querySelector(".navbar");
  const updateNav = () => nav?.classList.toggle("is-scrolled", window.scrollY > 16);
  window.addEventListener("scroll", updateNav, { passive: true });
  updateNav();
  if ("IntersectionObserver" in window && !reducedMotion()) {
    observer = new IntersectionObserver((entries) => entries.forEach(({ target, isIntersecting }) => {
      if (!isIntersecting) return;
      target.classList.remove("reveal-pending");
      target.classList.add("is-revealed");
      observer.unobserve(target);
    }), { threshold: 0.08 });
    revealElements();
  }
}

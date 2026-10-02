// A single decorative aircraft. Motion runs only while the hero can be seen.
export function initAirplaneHero(
  hero = document.querySelector("[data-airplane-hero]"),
) {
  const plane = hero?.querySelector("#heroPlane");
  if (!hero || !plane) return () => {};
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const fine = matchMedia("(hover: hover) and (pointer: fine)");
  const orbitSpeed = (Math.PI * 2) / 14;
  const returnDuration = 1.5;
  let mode = "IDLE",
    frame = 0,
    lastTime = 0,
    destroyed = false;
  let inView = true,
    pageActive = true,
    windowFocused = true,
    geometryDirty = true,
    initialized = false;
  let pointerX = 0,
    pointerY = 0,
    pointerDirty = false,
    pointerInside = false;
  let x = 0,
    y = 0,
    angle = 0,
    targetX = 0,
    targetY = 0;
  let phase = -Math.PI * 0.6,
    returnTime = 0,
    returnX = 0,
    returnY = 0;
  let bounds,
    halfWidth = 0,
    halfHeight = 0,
    limits,
    orbit;
  let previousTransform = "";

  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const difference = (from, to) =>
    Math.atan2(Math.sin(to - from), Math.cos(to - from));
  const canAnimate = () =>
    !destroyed &&
    !reduced.matches &&
    fine.matches &&
    inView &&
    !document.hidden &&
    pageActive &&
    windowFocused;
  const state = (next) => {
    if (mode === next && hero.dataset.flightState === next) return;
    mode = next;
    hero.dataset.flightState = next;
  };
  function stop() {
    cancelAnimationFrame(frame);
    frame = lastTime = 0;
    hero.dataset.flightRunning = "false";
  }
  function schedule() {
    if (frame || !canAnimate()) return;
    hero.dataset.flightRunning = "true";
    frame = requestAnimationFrame(tick);
  }
  function measure() {
    bounds = hero.getBoundingClientRect();
    halfWidth = plane.offsetWidth / 2;
    halfHeight = plane.offsetHeight / 2;
    const margin = Math.hypot(halfWidth, halfHeight) + 18;
    const insetX = Math.min(margin, bounds.width / 2);
    const insetY = Math.min(margin, bounds.height / 2);
    limits = {
      left: insetX,
      right: bounds.width - insetX,
      top: insetY,
      bottom: bounds.height - insetY,
    };
    const cx = clamp(bounds.width * 0.66, limits.left, limits.right);
    const cy = clamp(bounds.height * 0.48, limits.top, limits.bottom);
    orbit = {
      cx,
      cy,
      rx: Math.max(
        0,
        Math.min(bounds.width * 0.24, cx - limits.left, limits.right - cx),
      ),
      ry: Math.max(
        0,
        Math.min(bounds.height * 0.27, cy - limits.top, limits.bottom - cy),
      ),
    };
    x = clamp(x, limits.left, limits.right);
    y = clamp(y, limits.top, limits.bottom);
    geometryDirty = false;
  }
  function orbitPoint() {
    return {
      x: orbit.cx + Math.cos(phase) * orbit.rx,
      y: orbit.cy + Math.sin(phase) * orbit.ry,
    };
  }
  function beginReturn() {
    returnX = x;
    returnY = y;
    returnTime = 0;
    phase = Math.atan2(
      (y - orbit.cy) / Math.max(orbit.ry, 1),
      (x - orbit.cx) / Math.max(orbit.rx, 1),
    );
    state("RETURN");
  }
  function tick(time) {
    frame = 0;
    if (!canAnimate()) {
      stop();
      return;
    }
    const dt = lastTime ? Math.min((time - lastTime) / 1000, 0.05) : 0;
    lastTime = time;
    if (geometryDirty) measure();
    if (!initialized) {
      ({ x, y } = orbitPoint());
      angle = Math.atan2(
        orbit.ry * Math.cos(phase),
        -orbit.rx * Math.sin(phase),
      );
      initialized = true;
      hero.classList.add("is-airplane-ready");
    }
    if (pointerDirty) {
      pointerDirty = false;
      if (pointerInside) state("FOLLOW");
    }
    if (!pointerInside && mode === "FOLLOW") beginReturn();
    const previousX = x,
      previousY = y;
    let desiredAngle = angle;
    if (mode === "FOLLOW") {
      targetX = clamp(
        pointerX - bounds.left + Math.min(halfWidth * 0.4, 44),
        limits.left,
        limits.right,
      );
      targetY = clamp(
        pointerY - bounds.top - Math.min(halfHeight * 0.5, 42),
        limits.top,
        limits.bottom,
      );
      const blend = 1 - Math.exp(-6 * dt);
      x += (targetX - x) * blend;
      y += (targetY - y) * blend;
      if (Math.hypot(x - previousX, y - previousY) > 0.01)
        desiredAngle = Math.atan2(y - previousY, x - previousX);
    } else {
      phase += orbitSpeed * dt;
      const point = orbitPoint();
      if (mode === "RETURN") {
        returnTime += dt;
        const t = clamp(returnTime / returnDuration, 0, 1);
        const blend = t * t * t * (t * (t * 6 - 15) + 10);
        x = returnX + (point.x - returnX) * blend;
        y = returnY + (point.y - returnY) * blend;
        if (Math.hypot(x - previousX, y - previousY) > 0.01)
          desiredAngle = Math.atan2(y - previousY, x - previousX);
        if (t === 1) state("IDLE");
      } else {
        x = point.x;
        y = point.y;
        desiredAngle = Math.atan2(
          orbit.ry * Math.cos(phase),
          -orbit.rx * Math.sin(phase),
        );
      }
    }
    angle += difference(angle, desiredAngle) * (1 - Math.exp(-10 * dt));
    x = clamp(x, limits.left, limits.right);
    y = clamp(y, limits.top, limits.bottom);
    const transform = `translate3d(${(x - halfWidth).toFixed(3)}px, ${(y - halfHeight).toFixed(3)}px, 0) rotate(${((angle * 180) / Math.PI).toFixed(3)}deg)`;
    if (transform !== previousTransform) {
      plane.style.transform = transform;
      previousTransform = transform;
    }
    if (
      mode === "FOLLOW" &&
      Math.hypot(targetX - x, targetY - y) < 0.08 &&
      Math.abs(difference(angle, desiredAngle)) < 0.001
    ) {
      stop();
    } else schedule();
  }

  // Pointer handlers store coordinates only; layout reads and transforms live in RAF.
  function move(event) {
    if (event.pointerType === "touch" || reduced.matches || !fine.matches)
      return;
    pointerX = event.clientX;
    pointerY = event.clientY;
    pointerInside = pointerDirty = true;
    schedule();
  }
  function leave() {
    pointerInside = false;
    pointerDirty = false;
    schedule();
  }
  function invalidateGeometry() {
    geometryDirty = true;
    schedule();
  }
  function syncMotionPreference() {
    stop();
    pointerInside = pointerDirty = false;
    if (reduced.matches || !fine.matches) {
      state("STATIC");
      hero.classList.remove("is-airplane-ready");
      plane.style.removeProperty("transform");
      previousTransform = "";
    } else {
      state("IDLE");
      initialized = false;
      geometryDirty = true;
      schedule();
    }
  }
  function visibility() {
    if (document.hidden) {
      pointerInside = false;
      stop();
    } else {
      geometryDirty = true;
      schedule();
    }
  }
  function pageHide() {
    pageActive = false;
    stop();
  }
  function pageShow() {
    pageActive = true;
    geometryDirty = true;
    schedule();
  }
  function windowBlur() {
    windowFocused = false;
    pointerInside = false;
    stop();
  }
  function windowFocus() {
    windowFocused = true;
    geometryDirty = true;
    schedule();
  }
  const observer = new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    if (!inView) {
      pointerInside = false;
      stop();
    } else {
      geometryDirty = true;
      schedule();
    }
  });
  observer.observe(hero);
  const resizeObserver = new ResizeObserver(invalidateGeometry);
  resizeObserver.observe(hero);
  resizeObserver.observe(plane);
  hero.addEventListener("pointermove", move, { passive: true });
  hero.addEventListener("pointerleave", leave, { passive: true });
  window.addEventListener("scroll", invalidateGeometry, { passive: true });
  window.addEventListener("resize", invalidateGeometry, { passive: true });
  window.addEventListener("pagehide", pageHide);
  window.addEventListener("pageshow", pageShow);
  window.addEventListener("blur", windowBlur);
  window.addEventListener("focus", windowFocus);
  document.addEventListener("visibilitychange", visibility);
  reduced.addEventListener("change", syncMotionPreference);
  fine.addEventListener("change", syncMotionPreference);
  syncMotionPreference();
  return function destroy() {
    destroyed = true;
    stop();
    observer.disconnect();
    resizeObserver.disconnect();
    hero.removeEventListener("pointermove", move);
    hero.removeEventListener("pointerleave", leave);
    window.removeEventListener("scroll", invalidateGeometry);
    window.removeEventListener("resize", invalidateGeometry);
    window.removeEventListener("pagehide", pageHide);
    window.removeEventListener("pageshow", pageShow);
    window.removeEventListener("blur", windowBlur);
    window.removeEventListener("focus", windowFocus);
    document.removeEventListener("visibilitychange", visibility);
    reduced.removeEventListener("change", syncMotionPreference);
    fine.removeEventListener("change", syncMotionPreference);
  };
}

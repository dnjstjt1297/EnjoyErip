import { initSite } from './site.js';
import { $ } from './ui.js';

initSite();
(() => {
  // Different depths make the travel collage gently follow the pointer.
  const hero = $('.hero');
  const art = $('.hero-art');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  let targetX = 0;
  let targetY = 0;
  let currentX = 0;
  let currentY = 0;
  let motionFrame = 0;

  function animateArt() {
    currentX += (targetX - currentX) * .09;
    currentY += (targetY - currentY) * .09;
    art.style.setProperty('--travel-x', currentX.toFixed(2) + 'px');
    art.style.setProperty('--travel-y', currentY.toFixed(2) + 'px');
    if (Math.abs(targetX - currentX) + Math.abs(targetY - currentY) > .05) {
      motionFrame = window.requestAnimationFrame(animateArt);
    } else {
      motionFrame = 0;
    }
  }

  function moveArt(x, y) {
    targetX = x;
    targetY = y;
    if (!motionFrame) motionFrame = window.requestAnimationFrame(animateArt);
  }

  if (hero && art) {
    hero.addEventListener('pointermove', (event) => {
      if (reducedMotion.matches || !finePointer.matches || event.pointerType === 'touch') return;
      const bounds = hero.getBoundingClientRect();
      moveArt(((event.clientX - bounds.left) / bounds.width - .5) * 36,
        ((event.clientY - bounds.top) / bounds.height - .5) * 28);
    }, { passive: true });
    hero.addEventListener('pointerleave', () => moveArt(0, 0));
    function resetArt() {
      window.cancelAnimationFrame(motionFrame);
      motionFrame = 0;
      targetX = targetY = currentX = currentY = 0;
      art.style.setProperty('--travel-x', '0px');
      art.style.setProperty('--travel-y', '0px');
    }
    reducedMotion.addEventListener('change', resetArt);
    finePointer.addEventListener('change', resetArt);
    window.addEventListener('blur', resetArt);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) resetArt();
    });
  }
  $('#exploreButton')?.addEventListener('click', () => { location.href = 'explore.html'; });
})();

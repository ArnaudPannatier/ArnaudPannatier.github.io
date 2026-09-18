const root = document.documentElement;
const themeToggle = document.querySelector('#theme-toggle');
const profile = document.querySelector('#profile');
const text = document.querySelector('#biography-text');
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const desktop = matchMedia('(min-width: 1024px)');
const clamp = value => Math.max(0, Math.min(1, value));
let pending = false;
let revealTimer;

function themeLabel() {
  const label = root.dataset.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
  themeToggle.setAttribute('aria-label', label);
  themeToggle.title = label;
}
themeToggle.addEventListener('click', () => {
  root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem('site-theme', root.dataset.theme); } catch {}
  themeLabel();
});
themeLabel();

function reveal() {
  clearTimeout(revealTimer);
  root.classList.remove('intro');
}
revealTimer = setTimeout(reveal, motion.matches ? 0 : 2200);
window.addEventListener('scroll', reveal, {once: true, passive: true});
window.addEventListener('keydown', reveal, {once: true});

function updateScroll() {
  pending = false;
  // Native scrolling keeps moving the biography upward. As its last lines
  // enter the viewport, the pinned profile exits left and the galaxy returns.
  const bottom = text.getBoundingClientRect().bottom;
  const progress = clamp((innerHeight - bottom) / innerHeight);
  const eased = progress * progress * (3 - 2 * progress);
  root.style.setProperty('--profile-height', `${profile.offsetHeight}px`);
  profile.style.setProperty('--profile-x', `${desktop.matches && !motion.matches ? -eased * (profile.offsetWidth + 80) : 0}px`);
  profile.style.setProperty('--profile-opacity', String(1 - eased));
  profile.inert = eased > .98;
  root.style.setProperty('--divider-opacity', String(1 - eased));
  root.style.setProperty('--reading-opacity', String(1 - eased));
  const base = root.dataset.theme === 'dark' ? .72 : .38;
  root.style.setProperty('--scene-opacity', String(base + (1 - base) * eased));
}
function requestUpdate() {
  if (!pending) {
    pending = true;
    requestAnimationFrame(updateScroll);
  }
}
window.addEventListener('scroll', requestUpdate, {passive: true});
window.addEventListener('resize', requestUpdate);
window.addEventListener('pageshow', requestUpdate);
themeToggle.addEventListener('click', requestUpdate);
motion.addEventListener('change', () => { reveal(); requestUpdate(); });
new ResizeObserver(requestUpdate).observe(text);
new ResizeObserver(requestUpdate).observe(profile);
updateScroll();

/*
  The light and the dark theme. The head script sets <html data-theme> before the first paint, from the
  visitor's last choice or else the system's; the button in the bar switches it and remembers the
  choice. Each change swaps the lynx mark for the one drawn for that ground and the browser's bar
  colour, in one cross-fade where the browser has view transitions and motion is welcome.
*/
const root = document.documentElement;
const btn = document.querySelector('.theme-btn');
const bar = document.querySelector('meta[name="theme-color"]');
const BAR = { light: '#f1f3ef', dark: '#0f1210' };

function apply(theme) {
  root.dataset.theme = theme;
  for (const img of document.querySelectorAll('img[data-mark]')) {
    img.setAttribute('src', img.getAttribute('src').replace(/faceted-on-(light|dark)/, `faceted-on-${theme}`));
  }
  if (bar) bar.content = BAR[theme];
  if (btn) btn.setAttribute('aria-pressed', String(theme === 'dark'));
}

apply(root.dataset.theme === 'dark' ? 'dark' : 'light');

btn?.addEventListener('click', () => {
  const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem('lynxdb-theme', next); } catch (e) { /* private mode: the choice lasts the visit */ }
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (document.startViewTransition && !still) document.startViewTransition(() => apply(next));
  else apply(next);
});

// with no choice made, the page follows the system when it changes
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
  let chosen = null;
  try { chosen = localStorage.getItem('lynxdb-theme'); } catch (err) { /* no storage: follow the system */ }
  if (!chosen) apply(e.matches ? 'dark' : 'light');
});

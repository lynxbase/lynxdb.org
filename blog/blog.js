// The blog pages' script: the phone menu (the landing's, as the kit's system.js opens it), the copy
// buttons, scroll handles on wide tables, and the contents rail marking the section in view. The
// landing's theme.js runs the theme switch.

const status = document.querySelector('[data-copy-status]');
const say = text => { if (status) status.textContent = text; };

// ---------------------------------------------------------------- the menu sheet below 1024px
(() => {
  const nav = document.querySelector('.nav');
  const toggle = nav?.querySelector('.nav__toggle');
  if (!nav || !toggle) return;
  const bars = '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M2 5h14M2 13h14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  const cross = '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M4 4l10 10M14 4L4 14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  const setOpen = open => {
    nav.classList.toggle('is-open', open);
    document.body.classList.toggle('nav-locked', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.innerHTML = open ? cross : bars;
  };
  toggle.addEventListener('click', () => setOpen(!nav.classList.contains('is-open')));
  nav.querySelectorAll('.nav__item').forEach(item => {
    if (!item.querySelector('.nav__menu')) return;
    const btn = document.createElement('button');
    btn.className = 'nav__expand';
    btn.type = 'button';
    btn.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    btn.setAttribute('aria-label', `Show ${item.querySelector('.nav__link').textContent.trim()} links`);
    btn.setAttribute('aria-expanded', 'false');
    item.querySelector('.nav__link').after(btn);
    btn.addEventListener('click', () => {
      const open = !item.classList.contains('is-expanded');
      item.classList.toggle('is-expanded', open);
      btn.setAttribute('aria-expanded', String(open));
    });
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && nav.classList.contains('is-open')) { setOpen(false); toggle.focus(); }
  });
  nav.addEventListener('click', e => { if (nav.classList.contains('is-open') && e.target.closest('a[href]')) setOpen(false); });
  matchMedia('(min-width: 1024px)').addEventListener('change', e => { if (e.matches) setOpen(false); });
})();

// ---------------------------------------------------------------- copy
// A terminal copies its commands only (no prompt, no output); a code sheet copies all of its text.
const ICONS = '<svg class="i-copy" viewBox="0 0 16 16" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 3.5v-.5a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h.5"/></svg>'
  + '<svg class="i-done" viewBox="0 0 16 16" aria-hidden="true"><path d="m3.5 8.25 3 3 6-6.5"/></svg>';

async function copy(btn, text, done) {
  try {
    await navigator.clipboard.writeText(text);
    btn.classList.add('is-done');
    say(done);
    setTimeout(() => { btn.classList.remove('is-done'); say(''); }, 1800);
  } catch {
    say('Copy failed. Select the text and copy it by hand.');
  }
}

document.querySelectorAll('figure.code').forEach(fig => {
  const code = fig.querySelector('code');
  const cmds = [...code.querySelectorAll('.t-cmd')];
  const btn = document.createElement('button');
  btn.className = 'code__copy';
  btn.type = 'button';
  btn.setAttribute('aria-label', cmds.length ? (cmds.length > 1 ? 'Copy the commands' : 'Copy the command') : 'Copy the code');
  btn.innerHTML = ICONS;
  fig.querySelector('.code__bar').append(btn);
  btn.addEventListener('click', () => {
    const text = cmds.length ? cmds.map(c => c.textContent).join('\n') : code.textContent;
    copy(btn, text, cmds.length ? 'Command copied' : 'Code copied');
  });
});

document.querySelectorAll('[data-copy]').forEach(btn => {
  btn.addEventListener('click', () => copy(btn, btn.closest('.cmd').querySelector('code').textContent, 'Command copied'));
});

// ---------------------------------------------------------------- wide tables scroll, and say so to the keyboard
const tables = document.querySelectorAll('.table-wrap');
const fit = () => tables.forEach(wrap => {
  const scrolls = wrap.scrollWidth > wrap.clientWidth + 1;
  if (scrolls) { wrap.tabIndex = 0; wrap.setAttribute('role', 'region'); wrap.setAttribute('aria-label', 'Table, scrolls sideways'); }
  else { wrap.removeAttribute('tabindex'); wrap.removeAttribute('role'); wrap.removeAttribute('aria-label'); }
});
if (tables.length) { fit(); addEventListener('resize', fit, { passive: true }); }

// ---------------------------------------------------------------- the section in view
(() => {
  const links = [...document.querySelectorAll('.toc--rail a[href^="#"]')];
  if (!links.length) return;
  const heads = links.map(a => document.getElementById(decodeURIComponent(a.hash.slice(1)))).filter(Boolean);
  let current = null;
  const mark = () => {
    // the last heading that has passed a line a third of the way down the screen
    const line = innerHeight / 3;
    let at = heads[0];
    for (const h of heads) { if (h.getBoundingClientRect().top <= line) at = h; else break; }
    // at the foot of the page, the last section is the one being read
    if (innerHeight + scrollY >= document.documentElement.scrollHeight - 2) at = heads[heads.length - 1];
    if (at === current) return;
    current = at;
    links.forEach(a => a.toggleAttribute('aria-current', false));
    links.find(a => a.hash.slice(1) === at.id)?.setAttribute('aria-current', 'true');
  };
  let queued = false;
  addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; mark(); }); } }, { passive: true });
  addEventListener('resize', mark, { passive: true });
  mark();
})();

// The block grid is drawn from fixed data so every visit shows the same picture; the Web UI is webui.js.
(() => {
  const grid = document.querySelector('.eg__grid');
  if (grid) {
    const read = new Set([9, 26, 41]);
    for (let n = 0; n < 48; n++) {
      const i = document.createElement('i');
      if (read.has(n)) i.className = 'r';
      grid.append(i);
    }
  }

  const status = document.querySelector('[data-copy-status]');
  document.querySelectorAll('[data-copy]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const text = btn.closest('.cmd').querySelector('code').textContent;
      try {
        await navigator.clipboard.writeText(text);
        btn.classList.add('is-done');
        if (status) status.textContent = 'Command copied';
        setTimeout(() => { btn.classList.remove('is-done'); if (status) status.textContent = ''; }, 1800);
      } catch {
        if (status) status.textContent = 'Copy failed. Select the command and copy it by hand.';
      }
    });
  });
})();

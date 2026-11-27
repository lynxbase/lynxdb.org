/*
  The looping figures of the page (the hero's console and the Web UI): a list of scenes, each one
  action of 2.5 to 5 s, played in order while at least a third of the figure is on screen
  (design-system/motion.md). Scrolled away or with the tab hidden, the figure stops on its first picture and
  the next run starts from the top. The kit's pause button (ui.pausable) holds it: the scene under way
  jumps to its end and the figure keeps that state. Phones and reduced motion get the first picture,
  with no loop and no button.

    const loop = figureLoop({ root, box, scenes, first, rest, onHold, onRun });
    loop.takeOver();   // a visitor used a control: hold, and start from the first picture on Play

  A scene is { run(wait), end(), skip() }: run awaits wait(ms) between its steps (it rejects when the
  loop stops), end() sets the scene's last state at once, skip() leaves the scene out for now.
  onRun(true) and onRun(false) say when the loop starts and stops playing (for motion it carries in CSS).
*/
import ui from './assets/ui/ui.js';

const reducedQ = matchMedia('(prefers-reduced-motion: reduce)'), phoneQ = matchMedia('(max-width: 639px)');
const STOP = Symbol('stop');

export function figureLoop({ root, box, scenes, first, rest = 600, onHold = () => {}, onRun = () => {} }) {
  const pending = new Set();
  let idx = 0, cur = null, running = false, onScreen = false, paused = false, takenOver = false;
  const wait = ms => new Promise((res, rej) => {
    const p = { rej, t: setTimeout(() => { pending.delete(p); res(); }, ms) };
    pending.add(p);
  });
  const abort = () => { for (const p of pending) { clearTimeout(p.t); p.rej(STOP); } pending.clear(); };
  const can = () => onScreen && !document.hidden && !paused && !phoneQ.matches && !reducedQ.matches;

  async function play() {
    running = true;
    onRun(true);
    try {
      await wait(rest);
      for (;;) {
        cur = scenes[idx];
        if (!cur.skip?.()) await cur.run(wait);
        cur = null;
        idx = (idx + 1) % scenes.length;
      }
    } catch (e) {
      if (e !== STOP) throw e;
    } finally {
      running = false;
      onRun(false);
    }
  }
  function hold() {
    if (!running) return;
    abort();
    if (cur) { cur.end(); idx = (idx + 1) % scenes.length; }
    cur = null;
    onHold();
  }
  function stop() {
    if (!running) return;
    abort();
    cur = null;
    idx = 0;
    first();
  }
  function update() {
    if (can()) { if (!running) play(); }
    else if (running) (paused ? hold() : stop());
  }

  let unpause = () => {};
  const ctl = {
    pause() { paused = true; update(); },
    resume() {
      paused = false;
      if (takenOver) { takenOver = false; idx = 0; first(); }
      update();
    },
  };
  function setButton() {
    unpause();
    unpause = () => {};
    if (box && !phoneQ.matches && !reducedQ.matches) unpause = ui.pausable(box, ctl);
  }

  first();
  setButton();
  new IntersectionObserver(es => { onScreen = es[es.length - 1].intersectionRatio >= 1 / 3; update(); }, { threshold: [0, 1 / 3, 1] }).observe(root);
  document.addEventListener('visibilitychange', update);
  for (const q of [phoneQ, reducedQ]) q.addEventListener('change', () => { setButton(); update(); });

  return {
    takeOver() {
      takenOver = true;
      const b = box && box.querySelector(':scope > .loop-pause');
      if (!paused && b) b.click();
    },
  };
}

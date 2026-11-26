/* LynxDB design system runtime: ScrambleText. No dependencies. */
(function () {
  'use strict';

  var LOWER = 'abcdefghijklmnopqrstuvwxyz';
  var UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  var DIGIT = '0123456789';
  var running = new WeakMap();

  function reduced() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // A candidate glyph of the same class as the target, so the noise keeps the word's silhouette.
  function candidate(ch) {
    var set = LOWER.indexOf(ch) >= 0 ? LOWER : UPPER.indexOf(ch) >= 0 ? UPPER : DIGIT.indexOf(ch) >= 0 ? DIGIT : null;
    if (!set) return ch; // punctuation, signs and spaces stay put
    return set.charAt(Math.floor(Math.random() * set.length));
  }

  /**
   * Run one scramble on a text-only element. The real text stays in aria-label,
   * resolves left to right, and is restored exactly when the run ends.
   * options: { duration: ms (default 28ms per glyph, clamped 200..360), tick: ms between glyph swaps (default 40) }
   */
  function scramble(el, options) {
    if (!el || el.children.length > 2 || running.has(el) || reduced()) return;
    var text = el.getAttribute('data-scramble-text') || el.textContent;
    if (!text || text.length > 32) return;
    options = options || {};
    var duration = options.duration || Math.max(200, Math.min(360, text.length * 28));
    var tick = options.tick || 40;

    el.setAttribute('data-scramble-text', text);
    if (!el.hasAttribute('aria-label')) el.setAttribute('aria-label', text);

    var done = document.createElement('span');
    var noise = document.createElement('span');
    noise.className = 'lx-scr-noise';
    done.setAttribute('aria-hidden', 'true');
    noise.setAttribute('aria-hidden', 'true');
    el.textContent = '';
    el.appendChild(done);
    el.appendChild(noise);

    var start = performance.now();
    var lastSwap = -tick;
    var tail = '';

    function frame(now) {
      var elapsed = Math.max(0, now - start); // a frame timestamp can precede the event that started the run
      var settled = Math.min(text.length, Math.floor((elapsed / duration) * text.length));
      if (elapsed - lastSwap >= tick || settled === text.length) {
        lastSwap = elapsed;
        tail = '';
        for (var i = settled; i < text.length; i++) {
          tail += candidate(text.charAt(i));
        }
      } else {
        tail = tail.slice(tail.length - (text.length - settled));
      }
      done.textContent = text.slice(0, settled);
      noise.textContent = tail;
      if (settled < text.length) {
        running.set(el, requestAnimationFrame(frame));
      } else {
        el.textContent = text;
        running.delete(el);
      }
    }
    running.set(el, requestAnimationFrame(frame));
  }

  // Delegated wiring: any text-only [data-scramble] inside a link or button, on hover or keyboard focus.
  function onEnter(event) {
    var t = event.target;
    if (!t || !t.closest) return;
    var host = t.closest('a, button, [data-scramble-host]');
    var el = t.closest('[data-scramble]') || (host && host.querySelector('[data-scramble]'));
    if (!el) return;
    if (event.type === 'mouseover') {
      var from = event.relatedTarget;
      var scope = host || el;
      if (from && scope.contains(from)) return; // still inside: do not restart
    }
    scramble(el);
  }

  if (!window.matchMedia || window.matchMedia('(hover: hover)').matches) {
    document.addEventListener('mouseover', onEnter, true);
  }
  document.addEventListener('focusin', onEnter, true);

  window.LynxDS = window.LynxDS || {};
  window.LynxDS.scramble = scramble;
})();

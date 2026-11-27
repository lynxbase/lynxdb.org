/** LynxDB design system runtime, exposed as window.LynxDS. */
export interface ScrambleOptions {
  /** Total run time in ms. Default: 28ms per glyph, clamped to 200..360. */
  duration?: number;
  /** Ms between candidate glyph swaps. Default 40. */
  tick?: number;
}
/** Run one scramble on a text-only element. No-op under prefers-reduced-motion, while already running, or for text over 32 characters. */
export function scramble(el: HTMLElement, options?: ScrambleOptions): void;

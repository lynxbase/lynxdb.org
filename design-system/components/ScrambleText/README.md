# ScrambleText

A hover and focus effect for short `mono` labels and figures on the site: letters and digits are searched glyph by glyph and resolve left to right.

- Add `data-scramble` to a text-only element. Inside a link or button it runs on hover and focus of that control; put `data-scramble-host` on a row or tile to make the whole thing the trigger. `components/bundle.js` wires it; `LynxDS.scramble(el)` runs it by hand.
- Footer links, benchmark values and headline numbers only. See the Motion section for the full rules.
- The text keeps its width, its `aria-label` and its final value. Punctuation never changes. Under reduced motion it does nothing.

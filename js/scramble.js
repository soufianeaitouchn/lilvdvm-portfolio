/* -----------------------------------------------------------------------------
   Decoding text.

   A label does not simply change: its letters run through stand-in glyphs -
   some of them its own letters turned round - and settle on the real text
   from left to right, so the new word is read as it resolves. Short and
   quiet: it is for small uppercase labels, never for paragraphs.

   lilvdvmScramble(element, text) sets the text and plays it. A newer call
   on the same element takes over from one still running. With reduced
   motion the text is simply set.
----------------------------------------------------------------------------- */

(function () {
  "use strict";

  var GLYPHS = "ƎƆᴚИꓘ⅃ɅΛƧ#/<>_=+*01ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  var FLIP = { E: "Ǝ", C: "Ɔ", R: "ᴚ", N: "И", K: "ꓘ", L: "⅃", A: "Ɐ", S: "Ƨ", J: "Ꮁ", T: "⊥" };
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var running = new WeakMap();

  function pick(ch) {
    if (ch === " ") return " ";
    if (FLIP[ch] && Math.random() < 0.45) return FLIP[ch];
    return GLYPHS.charAt(Math.floor(Math.random() * GLYPHS.length));
  }

  window.lilvdvmScramble = function (el, text, opts) {
    if (!el) return;
    text = String(text == null ? "" : text);
    var prev = running.get(el);
    if (prev) cancelAnimationFrame(prev);
    el.setAttribute("aria-label", text);
    if (reduced) {
      el.textContent = text;
      return;
    }

    var duration = (opts && opts.duration) || Math.min(260 + text.length * 34, 900);
    var from = el.textContent;
    var len = Math.max(text.length, from.length);
    var t0 = 0;
    var tick = 0;
    var noise = [];

    function frame(now) {
      if (!t0) t0 = now;
      var p = Math.min((now - t0) / duration, 1);
      /* New stand-ins every other frame: fast enough to read as decoding,
         slow enough not to shimmer. */
      if (tick++ % 2 === 0) for (var k = 0; k < len; k++) noise[k] = pick(text.charAt(k) || "");
      var out = "";
      for (var i = 0; i < len; i++) {
        /* Each letter resolves at its own moment, left to right with a little
           spread, so the word settles as a wave rather than all at once. */
        var at = (i / len) * 0.7 + 0.25;
        if (p >= at) out += text.charAt(i);
        else if (p >= at - 0.35) out += noise[i] || "";
        else out += from.charAt(i) && p < 0.12 ? from.charAt(i) : (text.charAt(i) === " " ? " " : noise[i] || "");
      }
      el.textContent = out;
      if (p < 1) running.set(el, requestAnimationFrame(frame));
      else {
        el.textContent = text;
        running.delete(el);
      }
    }
    running.set(el, requestAnimationFrame(frame));
  };
})();

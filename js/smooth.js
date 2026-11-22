/* -----------------------------------------------------------------------------
   Smooth scrolling.

   Lenis takes the wheel over and eases the page towards where it was asked to
   go, which is what gives the scroll its weight. It still moves the real
   document, so everything already keyed to scroll position - the video scrub,
   the text reveal - keeps working off ordinary scroll events.

   The instance is published on window.lenis so the Infos opening can hold it
   still while the black is still up; nothing else should need it.
----------------------------------------------------------------------------- */

(function () {
  "use strict";

  if (typeof Lenis !== "function") return; // vendor file missing: native scroll

  /* Pages that do not scroll do not need a scroller. The works page runs an
     endless strip and the contact page is built to fit one screen; both mark
     themselves in the head before anything else loads.

     Skipping it there is not only tidiness. An instance costs a second
     requestAnimationFrame loop running every frame for nothing, and a set of
     wheel and touch listeners that run ahead of the page own ones on every
     event - on a page whose whole job is to stay smooth under exactly those
     events. */
  if (document.documentElement.classList.contains("no-scroll")) return;

  /* Touch is left native - and on a touch-first device that means no Lenis at
     all. Even with touch unsmoothed it still listens to every touchstart and
     touchmove with passive: false, so the browser has to wait on the main
     thread before it may scroll under the finger. With the films decoding and
     the scroll-driven pages drawing, that wait is the stutter. */
  if (window.matchMedia && window.matchMedia("(hover: none) and (pointer: coarse)").matches) return;

  var lenis = new Lenis({
    /* Lerp, not a duration. A duration restarts its whole ease-out on every
       wheel notch, and that ease opens at its steepest - so a turning wheel
       became a run of little lurches. Lerp closes a fixed share of the gap each
       frame: notches simply move the target, and the page glides after it. */
    lerp: 0.09,
    smoothWheel: true,
    syncTouch: false
  });

  window.lenis = lenis;

  function frame(time) {
    lenis.raf(time);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
})();

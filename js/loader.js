/* -----------------------------------------------------------------------------
   Entry loader.

   A black field split across the middle by a thin band carrying the word. The
   band fills white from the left as the page's assets arrive, and the word
   inverts as the fill sweeps past it. When it is full, the two halves of the
   black retract to their own edges and the band collapses into the seam
   between them, so the page is uncovered outward from the middle rather than
   merely faded away.

   Progress is real - it tracks the document, the webfonts and every image and
   video - but it is also floored by a minimum duration and paced by a curve, so
   a warm cache cannot reduce the whole thing to a flash and the climb reads as
   deliberate rather than mechanical.
----------------------------------------------------------------------------- */

(function () {
  "use strict";

  var root = document.documentElement;
  var loader = document.querySelector(".loader");
  if (!loader) return;

  /* Arrived by clicking our own nav: drop the loader entirely and behave as if
     the page had already been revealed. Removing the node matters - the Infos
     sequence keys off its presence to know whether to wait. */
  if (!root.classList.contains("has-loader")) {
    if (loader.parentNode) loader.parentNode.removeChild(loader);
    root.classList.add("is-loaded");
    return;
  }

  var fill = loader.querySelector(".loader__fill");

  var isWorks = !!document.querySelector('[data-track]');
  var MIN_MS = isWorks ? 250 : 3200;
  var MAX_MS = isWorks ? 1800 : 4500;
  var HOLD_MS = 260; // beat on a full band before the black parts
  var EASE = 0.12; // how hard the needle chases the true figure

  root.classList.add("is-loading");

  /* =========================== hold it still =========================== */

  /* Nothing moves while the loader is up. overflow: hidden alone is not enough:
     the smooth scroller takes the wheel and scrolls the page itself, which is
     programmatic and sails straight past it. So the input is stopped before it
     can reach the scroller at all - caught on the way down, on window, which is
     ahead of every other listener on the page.

     The scroller is deliberately not stopped and started here. The Infos page
     holds it still for its own opening, and a start() from the loader would let
     that page go early. */
  var SCROLL_KEYS = { 32: 1, 33: 1, 34: 1, 35: 1, 36: 1, 38: 1, 40: 1 };

  function swallow(e) {
    if (e.type === "keydown" && !SCROLL_KEYS[e.keyCode]) return;
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();
  }

  var HELD = ["wheel", "touchmove", "keydown"];
  var holdOpts = { passive: false, capture: true };

  HELD.forEach(function (type) {
    window.addEventListener(type, swallow, holdOpts);
  });

  function letGo() {
    HELD.forEach(function (type) {
      window.removeEventListener(type, swallow, holdOpts);
    });
  }

  /* A restored scroll position from a previous visit would put the page
     somewhere other than the top the instant the curtains part. */
  window.scrollTo(0, 0);
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";

  /* ============================== progress ============================== */

  /* Everything worth waiting for, weighted equally: the document itself, the
     webfonts (the type would otherwise reflow in view), and any media. */
  /* Deferred gallery/work media has no src until it is near the viewport or
     opened. It must not become a loading job: there is nothing for the loader
     to wait for, and no load event can arrive until another script promotes it. */
  /* Videos are not waited for: each has a light poster that shows at once and
     streams in behind the reveal. Waiting for a film's first frames kept slow
     connections staring at black for the full MAX_MS. */
  var media = [].slice.call(document.querySelectorAll("img")).filter(function (el) {
    return !!(el.currentSrc || el.getAttribute("src"));
  });
  var jobs = 2 + media.length; // document + fonts + each media element
  var done = 0;

  function finished() {
    done++;
  }

  if (document.readyState === "complete") finished();
  else window.addEventListener("load", finished);

  if (document.fonts && document.fonts.ready) document.fonts.ready.then(finished, finished);
  else finished();

  media.forEach(function (el) {
    var ready =
      el.tagName === "VIDEO" ? el.readyState >= 2 : el.complete && el.naturalWidth;
    if (ready) return finished();

    var seen = false;
    function once() {
      if (seen) return;
      seen = true;
      finished();
    }
    el.addEventListener(el.tagName === "VIDEO" ? "loadeddata" : "load", once);
    el.addEventListener("error", once);
  });

  /* ================================ run ================================= */

  /* The climb is paced rather than linear. Breakpoints are [fraction of the
     clock, figure reached]; straight lines between them, and the follower below
     rounds the joins so the changes of pace are felt rather than seen as kinks.

     The two shallow runs - 30 to 45, and 60 to 80 - each take far more of the
     clock than the ground they cover. That ratio is the whole trick: it is what
     makes them read as the thing hesitating rather than as it simply moving
     slowly. Loading that rises at a constant rate reads as a machine. */
  var CURVE = [
    [0.0, 0.0],
    [0.16, 0.3], // brisk away from nothing
    [0.42, 0.45], // hesitates: 15 points across a quarter of the clock
    [0.53, 0.6], // picks up again
    [0.84, 0.8], // hesitates again: 20 points across a third of the clock
    [1.0, 1.0] // and runs at the finish
  ];

  function pace(t) {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    for (var i = 1; i < CURVE.length; i++) {
      var a = CURVE[i - 1];
      var b = CURVE[i];
      if (t < b[0]) return a[1] + ((t - a[0]) / (b[0] - a[0])) * (b[1] - a[1]);
    }
    return 1;
  }

  var startedAt = performance.now();
  var shown = 0; // the eased figure actually on screen
  var lastScale = -1;
  var revealing = false;

  function frame(now) {
    var elapsed = now - startedAt;
    var real = jobs ? done / jobs : 1;

    /* Floored by the clock so it always reads as deliberate, and forced to
       finish if something never resolves. */
    var target = Math.min(real, pace(elapsed / MIN_MS));
    if (elapsed >= MAX_MS) target = 1;

    shown += (target - shown) * EASE;
    if (target - shown < 0.001) shown = target;

    var scale = Math.round(shown * 1000) / 1000;
    if (scale !== lastScale) {
      lastScale = scale;
      if (fill) fill.style.transform = "scaleX(" + scale + ")";
    }

    if (!revealing && shown > 0.999) {
      revealing = true;
      if (fill) fill.style.transform = "scaleX(1)";
      setTimeout(reveal, HOLD_MS);
      return;
    }

    requestAnimationFrame(frame);
  }

  /* The black parts at the band - the top half retracting upward, the bottom
     half downward - while the band itself collapses into the seam. */
  function reveal() {
    revealing = true;
    loader.classList.add("is-open");
    letGo();
    root.classList.remove("is-loading");
    root.classList.add("is-loaded");

    /* Announced as the curtains START parting, not after they finish, so any
       sequence waiting on the loader begins in step with the reveal rather
       than a second later. */
    document.dispatchEvent(new CustomEvent("site:revealed"));

    var gone = false;
    function clear() {
      if (gone) return;
      gone = true;
      if (loader.parentNode) loader.parentNode.removeChild(loader);
    }

    loader.addEventListener("transitionend", function (e) {
      if (e.propertyName === "transform" && e.target.classList.contains("loader__curtain"))
        clear();
    });

    /* Covers the band's 0.42s plus the curtains' 0.18s delay and 1.25s run,
       with room to spare - never leave it in the tree. */
    setTimeout(clear, 2200);
  }

  requestAnimationFrame(frame);

  /* A real timer as well as the rAF cap. requestAnimationFrame does not run in
     a background tab, and the MAX_MS check lives inside that loop - so without
     this, a page opened in a background tab and never focused could sit behind
     the black indefinitely. Timers still fire there. */
  setTimeout(function () {
    if (revealing) return;
    if (fill) fill.style.transform = "scaleX(1)";
    reveal();
  }, MAX_MS + 600);
})();

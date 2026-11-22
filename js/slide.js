/* -----------------------------------------------------------------------------
   Moving between pages: the page being left is carried up off the screen and
   the next one comes up behind it, as one sheet, while the row of links holds
   still in the middle.

   The pages are separate documents, so the move is played here, on the way
   out, with the next page's opening frame standing in for it - the home page
   and Infos both open paused on exactly that frame, so the hand-over is the
   same pixels; Works and Contact open on their own black. The next page is
   told it was arrived at this way, so it skips any opening of its own.
----------------------------------------------------------------------------- */

(function () {
  "use strict";

  var PHONE = "(max-width: 768px)"; // the home page's own breakpoint for its two cuts

  /* What each page opens on, and whether its links sit in the middle. Every
     page has them there now; a page that did not would have them fade on the
     way to or from it rather than hold. */
  var PAGES = {
    index: {
      mid: true,
      frame: function () {
        return window.matchMedia(PHONE).matches ? "pics/reel011_poster.webp" : "pics/showreel_poster.webp";
      }
    },
    works: { mid: true, frame: null },
    infos: {
      mid: true,
      frame: function () { return "pics/videoframe0.webp"; }
    },
    contact: { mid: true, frame: null },
    gallery: { mid: true, frame: null }
  };

  var DURATION = 1100; // matches the transition in the stylesheet
  var BLUR_OUT = 600; // ...and the dissolve between the home page and Infos
  var FADE_OUT = 650; // ...and the home film fading away on the way to Works

  function pageOf(path) {
    var m = path.match(/\/(index|works|infos|contact|gallery)\.html$/);
    if (m) return m[1];
    return /\/$/.test(path) ? "index" : null; // the site root serves the home page
  }

  var here = pageOf(location.pathname);
  if (!here) return;

  var root = document.documentElement;
  var busy = false;

  /* The opening frames are fetched once the page is idle, so whichever is
     wanted is decoded and waiting by the time anyone reaches for a link. */
  var frames = {};
  function frameFor(page) {
    var info = PAGES[page];
    if (!info.frame) return null;
    var src = info.frame();
    if (!frames[src]) {
      var img = new Image();
      img.decoding = "async";
      img.alt = "";
      img.src = src;
      frames[src] = img;
    }
    return frames[src];
  }

  function warm() {
    for (var page in PAGES) if (page !== here) frameFor(page);
  }
  if ("requestIdleCallback" in window) requestIdleCallback(warm, { timeout: 3000 });
  else setTimeout(warm, 1500);

  document.addEventListener("click", function (event) {
    if (event.defaultPrevented || event.button > 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    var link = event.target.closest("a[href]");
    if (!link || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;

    var url = new URL(link.href, location.href);
    if (url.origin !== location.origin) return;
    var target = pageOf(url.pathname);
    if (!target) return;

    /* The page already open: nothing to go to, so no reload and no black
       fade - just back to the top if it has been scrolled. */
    if (target === here && !url.hash) {
      event.preventDefault();
      if (window.scrollY > 0) {
        if (window.lenis) window.lenis.scrollTo(0);
        else window.scrollTo({ top: 0, behavior: "smooth" });
      }
      return;
    }
    if (target === here) return;

    if (busy) {
      event.preventDefault();
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    event.preventDefault();
    busy = true;
    if (window.lenis) window.lenis.stop();

    /* Between the home page and Works nothing slides. Going to Works, the
       film fades away to black and the cards come up one by one on the
       next page; coming back, the cards go one by one (js/orbit.js says how
       long that takes) and the home page fades up (its head script reads the
       flag and adds arrive-fade). */
    if ((here === "index" && target === "works") || (here === "works" && target === "index")) {
      var parting = { wait: 0 };
      window.dispatchEvent(new CustomEvent("slide:leave", { detail: parting }));
      if (here === "index") root.classList.add("is-fading");
      var fadeAway = function () {
        if (fadeAway.done) return;
        fadeAway.done = true;
        try {
          sessionStorage.setItem("lilvdvm:arrive", JSON.stringify({
            how: "slide", mid: PAGES[here].mid, fade: true, time: Date.now()
          }));
        } catch (e) {}
        location.href = link.href;
      };
      setTimeout(fadeAway, here === "index" ? FADE_OUT : Math.max(parting.wait || 0, 300));
      return;
    }

    /* To or from Infos, from any page, the page dissolves instead: it goes
       soft and fades to black, and the next one comes up out of the blur
       (its head script reads the flag and adds arrive-blur). The row of
       links stays sharp throughout. */
    if (here === "infos" || target === "infos") {
      /* A page with a farewell of its own plays it first - Works sends its
         cards away one by one - and the blur begins once they have all
         gone. Every other page blurs at once. */
      var before = { wait: 0 };
      window.dispatchEvent(new CustomEvent("slide:leave", { detail: before }));
      var blurAt = Math.max(before.wait || 0, 0);
      var blur = function () {
        root.classList.add("is-blurring");
        setTimeout(dissolve, BLUR_OUT + 120);
      };
      var dissolve = function () {
        if (dissolve.done) return;
        dissolve.done = true;
        try {
          sessionStorage.setItem("lilvdvm:arrive", JSON.stringify({
            how: "slide", mid: PAGES[here].mid, blur: true, time: Date.now()
          }));
        } catch (e) {}
        location.href = link.href;
      };
      var page = document.querySelector("main");
      if (page) page.addEventListener("transitionend", function (e) {
        if (e.target === page && e.propertyName === "opacity") dissolve();
      });
      if (blurAt) setTimeout(blur, blurAt);
      else blur();
      return;
    }

    var next = document.createElement("div");
    next.className = "slide-next slide-next--" + target;
    next.setAttribute("aria-hidden", "true");
    var frame = frameFor(target);
    if (frame) next.appendChild(frame);
    document.body.appendChild(next);

    if (PAGES[here].mid !== PAGES[target].mid) root.classList.add("slide-nav-swap");

    /* The page being left may play a farewell of its own first - Works drops
       its rectangles back down the stairs - and says here how long to wait. */
    var farewell = { wait: 0 };
    window.dispatchEvent(new CustomEvent("slide:leave", { detail: farewell }));
    var held = Math.max(0, farewell.wait || 0);
    var asked = Date.now();

    var gone = false;
    function leave() {
      if (gone) return;
      gone = true;
      try {
        sessionStorage.setItem("lilvdvm:arrive", JSON.stringify({
          how: "slide", mid: PAGES[here].mid, time: Date.now()
        }));
      } catch (e) {}
      location.href = link.href;
    }

    var started = false;
    function start() {
      if (started) return;
      started = true;
      next.getBoundingClientRect(); // the start position has to be laid out first
      root.classList.add("is-sliding");
      next.addEventListener("transitionend", function (e) {
        if (e.target === next && e.propertyName === "transform") leave();
      });
      setTimeout(leave, DURATION + 150);
    }

    /* Moved only once the frame can paint, or the sheet would come up blank -
       but never held for long by a slow image. */
    function go() {
      setTimeout(start, Math.max(0, held - (Date.now() - asked)));
    }
    var ready = frame && frame.decode ? frame.decode() : null;
    if (ready) ready.then(go, go);
    else go();
    setTimeout(start, Math.max(600, held));
  });

  /* Coming back to a page out of the back/forward cache, it is exactly as it
     was left: mid-departure. Put it back. */
  window.addEventListener("pageshow", function (e) {
    if (!e.persisted) return;
    busy = false;
    root.classList.remove("is-sliding", "slide-nav-swap", "is-blurring", "is-fading");
    var stale = document.querySelectorAll(".slide-next");
    for (var i = 0; i < stale.length; i++) stale[i].remove();
    if (window.lenis) window.lenis.start();
  });
})();

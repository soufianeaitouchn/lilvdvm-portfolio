/* -----------------------------------------------------------------------------
   Which film plays behind the first screen.

   Two cuts of the same idea: a landscape one for a desktop, and a portrait one
   for a phone - a 16:9 frame cropped to a tall screen throws away most of what
   was composed, so the phone gets footage shot for that shape instead.

   The choice is made here rather than with a media attribute on a <source>,
   because browsers vary in whether they honour that on a <video> at all, and
   none of them re-evaluate it. Doing it in script means exactly one file is
   ever requested, chosen before the element has a src to fetch.

   Runs where it sits in the document, so the src is set before the browser
   starts loading anything.
----------------------------------------------------------------------------- */

(function () {
  "use strict";

  var video = document.querySelector("[data-src-wide]");
  if (!video) return;

  /* The phone breakpoint. A handset held either way up is below this; a tablet
     or a laptop is above it and gets the landscape cut. */
  var PHONE = "(max-width: 768px)";

  var narrow = window.matchMedia && window.matchMedia(PHONE).matches;
  var pick = narrow ? "tall" : "wide";

  var src = video.getAttribute("data-src-" + pick);
  var poster = video.getAttribute("data-poster-" + pick);
  var size = (video.getAttribute("data-size-" + pick) || "").split("x");

  /* The intrinsic size keeps the element the right shape before a single frame
     has arrived, so the page does not reflow around it once it does. */
  if (size.length === 2) {
    video.setAttribute("width", size[0]);
    video.setAttribute("height", size[1]);
  }

  if (poster) video.setAttribute("poster", poster);

  /* Whether the browser starts the film itself.

     The element carries no autoplay attribute in the markup, and that is right
     for somebody arriving at the site: the loading screen is opaque while it is
     up, so a film running behind it would be playing to nobody and would be
     well past its opening frame by the time the black drew back. It is held,
     and started as the curtains part.

     Coming from another page of the site there is no loading screen, nothing to
     hold it back for, and nothing to start it either - which left the film
     sitting on its poster looking like a photograph. Asking from script is not
     the answer on its own: at that moment the document is still being parsed
     and the element has nothing to play, so the one request goes nowhere.

     Autoplay is the answer, because it is not a single request - the browser
     starts the film when the film is ready and it is allowed to, which is
     exactly the judgement being got wrong by hand. Muted and inline, so no
     policy stands in its way. */
  if (!document.documentElement.classList.contains("has-loader")) {
    video.setAttribute("autoplay", "");
  }

  /* Mobile browsers only allow silent autoplay when the element is muted as a
     property, not just by attribute, and inline. Set both before the src. */
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.setAttribute("muted", "");
  video.setAttribute("playsinline", "");

  /* Set last: this is the line that starts the download. */
  if (src) {
    video.setAttribute("src", window.siteMedia.videoSource(src));
    guardHD();
  }

  /* If the HD film fails, or has not arrived far enough to play within five
     seconds, the line is slower than the browser let on: carry on with the
     small film from the same point rather than leave the screen waiting. In a
     background tab the check waits until the page is looked at. */
  function guardHD() {
    var current = video.getAttribute("src") || "";
    if (current.indexOf(".web.mp4") < 0) return;
    var timer = 0;
    function stillHD() { return video.getAttribute("src") === current; }
    function fallBack() {
      clearTimeout(timer);
      if (!stillHD()) return;
      var at = video.currentTime;
      video.setAttribute("src", window.siteMedia.small(current));
      video.load();
      video.addEventListener("loadedmetadata", function () {
        try { if (at) video.currentTime = at; } catch (e) {}
        syncPlayback();
      }, { once: true });
    }
    function check() {
      if (!stillHD() || video.readyState >= 3) return;
      if (document.hidden) { timer = setTimeout(check, 5000); return; }
      fallBack();
    }
    timer = setTimeout(check, 5000);
    video.addEventListener("canplay", function () { if (stillHD()) clearTimeout(timer); }, { once: true });
    video.addEventListener("error", function () { if (stillHD()) fallBack(); }, { once: true });
  }

  // Keep the existing reveal timing, but stop decoding when the hero is gone.
  var onScreen = true;
  /* When the phone refuses to start the film (iOS Low Power Mode, data saver),
     iOS draws its own big play button over it. Instead, the film is hidden
     and its poster shown as a plain still behind the page, until the first
     touch actually gets it playing. */
  var screen = video.parentNode;
  function hold() {
    if (!video.paused) return;
    var still = video.getAttribute("poster");
    if (still && screen) {
      screen.style.backgroundImage = 'url("' + still + '")';
    }
    video.classList.add("is-held");
  }
  function release() {
    video.classList.remove("is-held");
  }
  video.addEventListener("playing", release);

  function syncPlayback() {
    if (document.hidden || !onScreen) video.pause();
    else if (!document.documentElement.classList.contains('is-loading')) {
      var p = video.play();
      if (p && typeof p.catch === "function") {
        p.catch(function (err) {
          if (err && err.name === "NotAllowedError") hold();
        });
      }
    }
  }

  /* Some iPhones neither play nor reject; if it is still sitting paused a
     moment after it should have started, treat that as a refusal too. */
  function checkStarted() {
    setTimeout(function () {
      if (video.paused && onScreen && !document.hidden &&
          !document.documentElement.classList.contains("is-loading")) hold();
    }, 1500);
  }
  if (document.documentElement.classList.contains("has-loader")) {
    document.addEventListener("site:revealed", checkStarted);
  } else {
    checkStarted();
  }

  /* If the browser still refused, the very first touch, scroll or key
     anywhere on the page starts the film - no need to find a play button.
     Listeners drop away once it is running. touchend and click are the
     gestures iOS accepts as permission to play. */
  var KICK = ["touchstart", "touchend", "pointerdown", "click", "scroll", "keydown"];
  function kick() {
    if (!video.paused) return unkick();
    syncPlayback();
  }
  function unkick() {
    KICK.forEach(function (t) {
      window.removeEventListener(t, kick, true);
    });
  }
  KICK.forEach(function (t) {
    window.addEventListener(t, kick, { capture: true, passive: true });
  });
  video.addEventListener("playing", unkick);
  // Retry as soon as enough data has arrived - an early play() can go nowhere.
  video.addEventListener("canplay", syncPlayback);
  if ('IntersectionObserver' in window) {
    var visibility = new IntersectionObserver(function (entries) {
      onScreen = entries[0].isIntersecting && entries[0].intersectionRatio > 0;
      video.dataset.mediaVisible = String(onScreen);
      syncPlayback();
    }, { threshold: 0.01 });
    visibility.observe(video);
  }
  document.addEventListener('visibilitychange', syncPlayback);
  document.addEventListener('site:revealed', syncPlayback);

  /* A rotation or a window drag can cross the breakpoint. Swapping the file at
     that point would restart the footage from nothing mid-view, so it is only
     done if the other cut is genuinely the right one now - and the current
     position is carried across so the change is a cut, not a rewind. */
  if (!window.matchMedia) return;

  var query = window.matchMedia(PHONE);

  function reconsider() {
    var wants = query.matches ? "tall" : "wide";
    if (wants === pick) return;
    pick = wants;

    var next = video.getAttribute("data-src-" + pick);
    if (!next) return;

    var at = video.currentTime;
    var wasPlaying = !video.paused;

    var nextSize = (video.getAttribute("data-size-" + pick) || "").split("x");
    if (nextSize.length === 2) {
      video.setAttribute("width", nextSize[0]);
      video.setAttribute("height", nextSize[1]);
    }

    var nextPoster = video.getAttribute("data-poster-" + pick);
    if (nextPoster) video.setAttribute("poster", nextPoster);

    video.setAttribute("src", window.siteMedia.videoSource(next));
    video.load();
    guardHD();

    video.addEventListener(
      "loadedmetadata",
      function () {
        /* The two cuts are different lengths, so the old position may be past
           the end of the new one. */
        if (isFinite(video.duration) && at < video.duration) {
          try {
            video.currentTime = at;
          } catch (e) {}
        }
        if (wasPlaying) {
          var playing = video.play();
          if (playing && typeof playing.catch === "function") playing.catch(function () {});
        }
      },
      { once: true }
    );
  }

  if (typeof query.addEventListener === "function") {
    query.addEventListener("change", reconsider);
  } else if (typeof query.addListener === "function") {
    query.addListener(reconsider); // older Safari
  }
})();

/* -----------------------------------------------------------------------------
   Infos — one continuous cinematic timeline.

   Scroll position is the master clock. Every visual state (video time, the
   cue, all four texts) is a pure function of a single normalised progress value, which is what makes the whole sequence perfectly
   bidirectional: scrolling up simply evaluates the same functions at a lower
   progress, so nothing has to be "rewound" or replayed.

   Ahead of that sits the opening: a very slow fade off black, run on its own
   virtual clock while the page is held at the top.
----------------------------------------------------------------------------- */

(function () {
  "use strict";

  var section = document.querySelector(".infos");
  if (!section) return;

  var video = section.querySelector(".infos__video");
  var veil = section.querySelector(".infos__veil");
  var cue = section.querySelector(".infos__cue");
  var texts = [].slice.call(section.querySelectorAll(".infos__step"));

  /* Arrived by the slide from the home page: the film is already uncovered. */
  var slid = document.documentElement.classList.contains("arrive-slide");

  /* ---------------------------------------------------------------- timings */

  var INTRO_FADE = 2000; // black -> first frame, unhurried but quick to land
  var INTRO_HOLD = 500; // beat on the fully visible frame
  var CUE_FADE = 1600; // "Scroll to see more" easing 0% -> 100%
  var SKIP_RATE = 7; // how fast the intro runs once the viewer intervenes
  var SKIP_GRACE = 600; // ignore input for this long (stray load-time events)

  /* The story texts rise this far as they arrive, and keep drifting the same
     way as they leave, so the four of them read as one continuous move. */
  var TEXT_LIFT = 16; // px risen into place
  var TEXT_DRIFT = 10; // px carried on upward while leaving

  /* Progress windows, 0 = top of the section, 1 = bottom. */
  /* Five scrolls finish the page (see stepping): each of the four texts is
     fully shown at 0.2, 0.4, 0.6 and 0.8, and the last scroll lets the
     fourth go and runs the film to its final frame at 1. */
  var CUE_OUT = [0.0, 0.03];
  var VIDEO_IN = [0.0, 1.0]; // scroll range mapped onto the video duration
  var STAGES = [
    { fadeIn: [0.1, 0.18], fadeOut: [0.22, 0.3] },
    { fadeIn: [0.3, 0.38], fadeOut: [0.42, 0.5] },
    { fadeIn: [0.5, 0.58], fadeOut: [0.62, 0.7] },
    { fadeIn: [0.7, 0.78], fadeOut: [0.84, 0.94] }
  ];

  /* ---------------------------------------------------------------- easing  */

  function clamp(v, a, b) {
    return v < a ? a : v > b ? b : v;
  }

  function norm(v, a, b) {
    return a === b ? (v >= b ? 1 : 0) : clamp((v - a) / (b - a), 0, 1);
  }

  /* Smootherstep: zero first *and* second derivative at both ends, so the fade
     has no perceptible moment of starting or stopping. */
  function smoother(t) {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  function ramp(v, w) {
    return smoother(norm(v, w[0], w[1]));
  }

  /* ---------------------------------------------------------- DOM writing   */

  /* Only touch the DOM when a value actually changes, at 1/1000 resolution. */
  var written = {};

  function setOpacity(el, key, value) {
    var v = Math.round(clamp(value, 0, 1) * 1000) / 1000;
    if (written[key] === v) return;
    written[key] = v;
    el.style.opacity = v;
  }

  function setStyle(el, key, prop, value) {
    if (written[key] === value) return;
    written[key] = value;
    el.style[prop] = value;
  }

  /* ---------------------------------------------------------------- video   */

  var duration = 0;
  var wantTime = 0; // where the scroll says the video should be
  var videoReady = false;

  /* The film is 97 frames at 24 a second, and every one of them is a keyframe,
     so any frame can be shown on its own without decoding the ones before it.
     The scroll is turned into a whole frame number and only a change of frame
     asks for a seek - a seek to a time between two frames shows the same
     picture and costs the same as a real one. */
  var FPS = 24;
  var shownFrame = -1; // the frame last asked for
  var mobilePlaybackStarted = false;
  var isMobile = window.matchMedia && window.matchMedia('(hover: none)').matches;

  var lastVideoScroll = 0;
  var videoSuspended = false;
  var rafId = null;

  video.autoplay = false;
  video.pause();
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  if (video.currentTime !== 0) video.currentTime = 0;

  function handleScrollPlayback() {
    if (!videoReady || document.hidden) return;
    if (!video.paused) video.pause();
  }

  function onMeta() {
    if (video.duration && isFinite(video.duration)) {
      duration = video.duration;
      videoReady = true;
      kick();
    }
  }

  if (video.readyState >= 1) onMeta();
  video.addEventListener("loadedmetadata", onMeta);
  video.addEventListener("canplay", onMeta);

  /* A seek has landed: if the scroll has moved on to another frame meanwhile,
     the loop asks for that one now. */
  video.addEventListener("seeked", function () { kick(); });

  /* The whole file is fetched into memory before it is handed to the element.
     Played from a network address, every seek can become a fresh range request
     - and some browsers make them - so a scrub waits on the network as well as
     on the decoder. From memory it waits on the decoder alone. Should the fetch
     fail, the element is simply given the address. */
  (function load() {
    var src = video.getAttribute("data-src");
    if (!src || video.getAttribute("src")) return;
    var direct = function () { video.src = src; };
    if (!window.fetch || !window.URL || !URL.createObjectURL) return direct();
    fetch(src)
      .then(function (res) {
        if (!res.ok) throw new Error(res.status);
        return res.blob();
      })
      .then(function (blob) { video.src = URL.createObjectURL(blob); }, direct);
  })();

  /* Phones (iOS Safari above all) ignore preload and will not fetch or paint a
     video that has never been played, so seeking it does nothing and the stage
     stays black behind the poster. One muted play-and-pause, at once and again
     on the first touch in case the first was refused, wakes it up. */
  function primeMobileVideo() {
    if (!isMobile || mobilePlaybackStarted) return;
    var attempt = video.play();
    if (attempt && attempt.then) {
      attempt.then(function () {
        mobilePlaybackStarted = true;
        video.pause();
        shownFrame = -1; // playing moved it; ask for the scroll's frame again
        kick();
      }, function () {});
    }
  }

  if (isMobile) {
    primeMobileVideo();
    window.addEventListener("touchstart", primeMobileVideo, { passive: true });
    /* The film arrives from memory a moment after the page, by which time the
       first attempt has found nothing to play - so try again once it is in. */
    video.addEventListener("loadeddata", primeMobileVideo);
  }

  /* Keep the video playing smoothly while the user is moving through the
     section; pausing on every scroll stop creates the visible lag/freeze. */

  function resetVideo() {
    if (!isMobile) video.pause();
    wantTime = 0;
    shownFrame = -1;
    lastVideoScroll = window.scrollY;
    try {
      if (video.currentTime !== 0) video.currentTime = 0;
    } catch (e) {}
  }

  /* ---------------------------------------------------------------- intro   */

  var introClock = slid ? INTRO_FADE : 0;
  var introRate = 1;
  var introDone = false;
  var unlocked = false;
  var cueLevel = 0;
  var startedAt = 0;

  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  window.scrollTo(0, 0);

  /* If the entry loader is up, the opening fade must not run behind it - it
     would be half spent by the time the curtains part. Hold the intro clock
     until the loader announces the reveal, then start counting from there. */
  var ready =
    !document.querySelector(".loader") ||
    document.documentElement.classList.contains("is-loaded");

  if (!ready) {
    document.addEventListener(
      "site:revealed",
      function () {
        ready = true;
        startedAt = performance.now(); // the skip grace begins now, not at load
        lastNow = 0; // and the wait is not banked as elapsed intro time
        kick();
      },
      { once: true }
    );
  }

  /* Once the opening has landed, the page is not scrolled freely: each scroll
     (stepping, below) carries it on to the next text. The wheel, touch and
     key handlers stay on for good - they are what reads those scrolls. */
  function unlock() {
    if (unlocked) return;
    unlocked = true;
    window.removeEventListener("scroll", pin);
  }

  function block(e) {
    e.preventDefault();
    if (!unlocked) skip();
    else if (e.type === "wheel") onWheel(e);
  }

  var SCROLL_KEYS = { 32: 1, 33: 1, 34: 1, 35: 1, 36: 1, 38: 1, 40: 1 };
  var KEY_DIR = { 32: 1, 34: 1, 40: 1, 33: -1, 38: -1, 36: -9, 35: 9 };
  function blockKeys(e) {
    if (SCROLL_KEYS[e.keyCode]) {
      e.preventDefault();
      if (!unlocked) skip();
      else if (!e.repeat) step(KEY_DIR[e.keyCode]);
    }
  }

  /* -------------------------------------------------------------- stepping */

  /* Where each scroll comes to rest: the top, then each of the four texts
     at the middle of its time fully shown, then the film's last frame. One
     scroll, one step - five to finish - and the film plays on as the page
     glides there. */
  var REST = [0, 0.2, 0.4, 0.6, 0.8, 1];
  var GLIDE = 1400; // ms the page takes to reach the next text
  var GAP = 220; // ms of quiet that mark the end of one wheel gesture
  var at = 0; // the resting place the page is at, or on its way to
  var gliding = false;
  var lastWheel = 0;
  var touchY = null;

  function easeInOut(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function restY(i) {
    return sectionTop + REST[i] * sectionRange;
  }

  function glide(y, done) {
    if (window.lenis && window.lenis.scrollTo) {
      window.lenis.scrollTo(y, {
        duration: GLIDE / 1000, lerp: 0, easing: easeInOut,
        force: true, lock: true, onComplete: done
      });
      return;
    }
    /* No smooth scroller on a phone: the glide is drawn here. */
    var from = window.scrollY, t0 = 0;
    function tick(now) {
      if (!t0) t0 = now;
      var k = Math.min((now - t0) / GLIDE, 1);
      window.scrollTo(0, from + (y - from) * easeInOut(k));
      if (k < 1) requestAnimationFrame(tick);
      else done();
    }
    requestAnimationFrame(tick);
  }

  function step(dir) {
    if (gliding || !dir) return;
    var next = clamp(at + dir, 0, REST.length - 1);
    if (next === at) return;
    at = next;
    gliding = true;
    var finished = false;
    var done = function () {
      if (finished) return;
      finished = true;
      gliding = false;
      lastWheel = performance.now(); // a gesture's tail must not count as a new one
    };
    glide(restY(next), done);
    setTimeout(done, GLIDE + 500);
    kick();
  }

  /* A trackpad sends a stream of wheel events for one flick, still coming
     well after the glide has started. Only the first of a stream counts: a
     new scroll is one that follows a moment of quiet. */
  function onWheel(e) {
    var now = performance.now();
    var fresh = now - lastWheel > GAP;
    lastWheel = now;
    if (!fresh || gliding || Math.abs(e.deltaY) < 2) return;
    step(e.deltaY > 0 ? 1 : -1);
  }

  window.addEventListener("touchstart", function (e) {
    touchY = e.touches.length === 1 ? e.touches[0].clientY : null;
  }, { passive: true });
  window.addEventListener("touchend", function (e) {
    if (touchY === null || !unlocked || !e.changedTouches.length) return;
    var dy = touchY - e.changedTouches[0].clientY;
    touchY = null;
    if (Math.abs(dy) > 40) step(dy > 0 ? 1 : -1);
  }, { passive: true });

  /* Covers dragging the scrollbar, which no key or wheel handler would catch. */
  function pin() {
    if (!unlocked) window.scrollTo(0, 0);
  }

  function skip() {
    if (introDone) return;
    if (performance.now() - startedAt < SKIP_GRACE) return;
    introRate = SKIP_RATE;
  }

  window.addEventListener("wheel", block, { passive: false });
  window.addEventListener("touchmove", block, { passive: false });
  window.addEventListener("keydown", blockKeys);
  window.addEventListener("scroll", pin);

  /* preventDefault alone is not enough once a smooth scroller owns the wheel -
     it would keep easing the page along underneath the opening. */
  if (window.lenis) window.lenis.stop();

  /* ---------------------------------------------------------------- render  */

  /* Resolved once into document coordinates, so progress is a function of
     scrollY and nothing else.

     Measuring it live against window.innerHeight is what made the sequence
     jitter on a phone: the browser chrome collapses and expands as you scroll
     and innerHeight moves with it, so the whole timeline stretched and shrank
     underneath a finger going steadily one way.

     The height used here is documentElement.clientHeight - the layout viewport,
     which chrome collapsing does NOT change - so the measurement is stable by
     construction rather than by guessing which resizes were real. It also drops
     a forced layout read from every frame. */
  var sectionTop = 0;
  var sectionRange = 1;

  function measure() {
    sectionTop = section.getBoundingClientRect().top + window.scrollY;
    sectionRange = Math.max(section.offsetHeight - document.documentElement.clientHeight, 1);
  }

  function progress() {
    return clamp((window.scrollY - sectionTop) / sectionRange, 0, 1);
  }

  function render(p) {
    /* No image-to-video handover: the opening frame is the video's own first
       frame (its poster), so scroll only ever moves the video's timeline. */
    if (videoReady) {
      wantTime = norm(p, VIDEO_IN[0], VIDEO_IN[1]) * duration;
    }

    /* The cue is deliberately plain: it just appears, then loops faint to full
       in CSS. No movement, no tracking - that lives on the story texts. */
    setOpacity(cue, "cue", smoother(cueLevel) * (1 - ramp(p, CUE_OUT)));
    for (var i = 0; i < texts.length; i++) {
      var st = STAGES[i];
      var arrive = ramp(p, st.fadeIn);
      var leave = ramp(p, st.fadeOut);

      setOpacity(texts[i], "t" + i, arrive * (1 - leave));

      /* Rises into place, then carries on in the same direction on the way out.
         Transform only - animating letter-spacing here would re-wrap the lines
         mid-fade, and it keeps this off the layout path during scrubbing. */
      var y = (1 - arrive) * TEXT_LIFT - leave * TEXT_DRIFT;
      y = Math.round(y * 10) / 10;
      setStyle(
        texts[i],
        "ty" + i,
        "transform",
        y ? "translate3d(0," + y + "px,0)" : "none"
      );
    }
  }

  /* Show the frame the scroll is on, straight away and one seek at a time.

     Straight to it, not eased towards it in small steps: every step was a seek
     of its own, so following the scroll cost a seek every frame, the picture
     trailed behind the page, and kept moving after the page had stopped. The
     scroll is already smooth - Lenis eases the wheel - so the frame needs no
     easing of its own.

     One at a time: a seek asked for while another is still being decoded
     either waits behind it or throws it away, and a run of those is the
     stutter. While a seek is in flight nothing new is asked for; when it lands
     ("seeked" kicks the loop) the frame the scroll is on by then is asked for,
     skipping any it passed in the meantime. Returns whether the picture has
     caught up, which is what lets the loop go idle. */
  function driveVideo() {
    if (!videoReady || !duration || videoSuspended || document.hidden) return true;

    if (!video.paused) video.pause();

    if (window.scrollY !== lastVideoScroll) {
      lastVideoScroll = window.scrollY;
      handleScrollPlayback();
    }

    var last = Math.max(Math.floor(duration * FPS) - 1, 0);
    var frame = Math.round(clamp(wantTime, 0, duration) * FPS);
    if (frame > last) frame = last;

    if (video.seeking) return false;
    if (frame === shownFrame) return true;

    shownFrame = frame;
    /* Aimed a little inside the frame rather than at its edge, so rounding in
       the browser cannot land it on the one before. */
    try {
      video.currentTime = (frame + 0.25) / FPS;
    } catch (e) {}
    return false;
  }

  /* ---------------------------------------------------------------- loop    */

  var running = false;
  var lastNow = 0;
  var lastP = -1;
  var idle = 0;

  function frame(now) {
    var dt = lastNow ? Math.min(now - lastNow, 64) : 16;
    lastNow = now;

    if (!introDone && ready) {
      introClock += dt * introRate;

      setOpacity(veil, "veil", 1 - smoother(clamp(introClock / INTRO_FADE, 0, 1)));

      if (introClock >= INTRO_FADE) unlock();

      cueLevel = clamp((introClock - INTRO_FADE - INTRO_HOLD) / CUE_FADE, 0, 1);
      if (introClock >= INTRO_FADE + INTRO_HOLD + CUE_FADE) {
        introDone = true;
        cue.classList.add("is-cued"); // only now start the breathing pulse
      }
    }

    var p = progress();
    render(p);
    var settled = driveVideo();

    if (introDone && settled && p === lastP) idle++;
    else idle = 0;
    lastP = p;

    if (idle > 24) {
      running = false;
      lastNow = 0;
      return;
    }
    rafId = requestAnimationFrame(frame);
  }

  function kick() {
    if (running) return;
    running = true;
    idle = 0;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(frame);
  }

  window.addEventListener("scroll", function () {
    handleScrollPlayback();
    kick();
  }, { passive: true });
  /* Safe to re-measure on every resize now: the value being read does not
     change when the browser chrome moves. */
  window.addEventListener("resize", function () {
    measure();
    kick();
  });

  window.addEventListener("orientationchange", function () {
    setTimeout(function () {
      measure();
      kick();
    }, 120); // the new viewport is not reliable until after the rotation
  });
  document.addEventListener("visibilitychange", function () {
    video.pause();
    if (!document.hidden) kick();
  });
  window.addEventListener("pagehide", function () {
    videoSuspended = true;
    video.pause();
  });
  window.addEventListener("pageshow", function (e) {
    videoSuspended = false;
    if (e.persisted) {
      window.scrollTo(0, 0);
      at = 0;
      gliding = false;
      resetVideo();
      kick();
    }
  });

  measure();
  startedAt = performance.now();
  kick();
})();

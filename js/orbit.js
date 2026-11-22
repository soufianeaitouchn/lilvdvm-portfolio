/* -----------------------------------------------------------------------------
   Works: the projects in orbit around the wordmark.

   Each project once, on one ring round the logo in the middle row. The ring
   is leant back and turned a little to one side, so its foot comes towards
   the viewer and its head falls away; it turns slowly on its own, and the
   wheel, or a hand going round the logo, spins it with some weight. Cards
   always face the viewer - only their place on the ring moves - and the
   middle is kept clear so the logo is never covered.

   Pointing at a card slows the turn, brings it up a touch, plays its clip and
   sends the rest to grey, and the labels at the foot decode to its name.
   Clicking opens the project exactly as before: project.js builds the cards
   and owns the project view, and this file only places them.

   On arrival the cards appear one after another in their places as the
   ring turns; on leaving they go again in reverse turn, the ring still
   turning.

   Nothing here paints: each frame writes a transform and an opacity per card.
----------------------------------------------------------------------------- */

(function () {
  "use strict";

  var main = document.querySelector(".works--orbit");
  var track = document.querySelector("[data-track]");
  if (!main || !track) return;
  var stage = track.parentElement;
  var html = document.documentElement;
  var projects = window.worksProjects || [];

  /* The page has no length to scroll; the smooth scroller has nothing to do. */
  if (window.lenis && typeof window.lenis.stop === "function") window.lenis.stop();
  /* The strip's arrival is not used here - the orbit has its own. */
  html.classList.remove("works-enter");

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var touchOnly = window.matchMedia("(hover: none)").matches;

  /* ============================== the feel ============================== */

  var SPIN = 0.07; // radians a second the ring turns on its own - pointing at a card does not stop it
  var FRICTION = 0.965; // of a flick's spin kept each frame at 60Hz - a long, soft run-out
  var WHEEL = 0.0011; // radians a second of spin per pixel of wheel
  var INTENT = 110; // ms the pointer rests on a card before it takes focus
  var FLAT = 0.5; // the ring seen at a slant: its height against its width
  var DEPTH = 0.08; // how much larger a card grows at the near side of the ring
  var LEAN = 0.06; // how far the pointer tilts the ring further - a hint, not a steer

  /* Every card the same frame as the films themselves. */
  var SHAPE = 16 / 9;

  /* ============================== the state ============================= */

  var cards = [];
  var yaw = 0, spin = 0; // yaw: how far round the ring has turned
  var leanX = 0, leanY = 0, wantLeanX = 0, wantLeanY = 0;
  /* Arriving, the cards appear one after another in their places on the
     ring as it turns; leaving, they go again one after another, the last to
     come the first to go. */
  var STEP_IN = 110, APPEAR = 650; // ms between cards, and each one's fade-up
  var STEP_OUT = 70, VANISH = 420; // ...and the same, going
  /* The ring was set for thirteen. With more, each card is a little smaller
     and the steps a little quicker, so the ring stays as full and the
     arrival and leaving take as long. */
  var FOR = 13, SIZE = 1;
  var hovered = null;
  var paused = false;
  var started = reduced;
  var startAt = 0, leaveAt = 0;
  var cx = 0, cy = 0, R = 0, ROLL = 0, BASE = 0, LOGO_W = 0, LOGO_H = 0;
  var last = 0, raf = 0;

  function ease(t) { return 1 - Math.pow(1 - t, 4); }

  function build() {
    var panels = [].slice.call(track.querySelectorAll(".panel"));
    var n = panels.length;
    var crowd = Math.min(1, FOR / Math.max(n, 1));
    STEP_IN = 110 * crowd;
    STEP_OUT = 70 * crowd;
    SIZE = Math.sqrt(crowd);
    cards = panels.map(function (el, i) {
      /* Evenly round one ring, each card nudged a touch in or out so the
         ring reads as placed by hand rather than drawn with compasses. */
      var image = el.querySelector(".panel__img");
      if (image && !image.getAttribute("src") && window.worksMedia) window.worksMedia.loadImage(image);
      return {
        el: el,
        angle: (i / n) * Math.PI * 2,
        reach: 0.95 + ((i * 7) % 5) * 0.025, // 0.95 .. 1.05 of the radius
        order: i, // its turn in the arrival - round the ring, in its own direction
        boost: 1 // eased towards 1.1 while the card has focus
      };
    });
    measure();
  }

  function measure() {
    var w = window.innerWidth;
    var h = window.innerHeight;
    cx = w / 2;
    cy = h / 2;
    var phone = w <= 760 || h > w * 1.2;
    /* A ring seen at a slant: an ellipse, its long axis tipped off the
       level. Across a monitor it lies wide and dips to the right; on a tall
       phone it stands nearly upright, so it fills the screen's own shape. */
    BASE = (phone ? Math.min(Math.max(w * 0.34, 110), 190) : Math.min(Math.max(170, w * 0.15), 280)) * SIZE;
    ROLL = phone ? -1.2 : 0.3;
    R = phone ? Math.min(h * 0.34, (w * 0.5 - BASE * 0.5) / (FLAT * 1.15)) : Math.min(w * 0.28, h * 0.56);
    /* Half the wordmark's box, with some air round it. */
    var logo = document.querySelector(".herolinks__logo");
    var lr = logo ? logo.getBoundingClientRect() : { width: 120, height: 28 };
    LOGO_W = lr.width / 2 + (phone ? 14 : 26);
    LOGO_H = lr.height / 2 + (phone ? 10 : 18);
    for (var i = 0; i < cards.length; i++) {
      var c = cards[i];
      c.w = Math.round(BASE);
      c.h = Math.round(BASE / SHAPE);
      c.el.style.width = c.w + "px";
      c.el.style.height = c.h + "px";
    }
  }

  /* ============================== drawing =============================== */

  function draw(f) {
    /* The pointer tips the ring a little further, and opens or narrows it. */
    var roll = ROLL + leanX, flat = FLAT + leanY;
    var cr = Math.cos(roll), sr = Math.sin(roll);
    var settle = Math.min(1, 0.14 * (f || 1));
    var front = null, frontZ = -Infinity;
    var now = performance.now();
    var n = cards.length;

    for (var i = 0; i < n; i++) {
      var c = cards[i];
      var a = c.angle + yaw;
      /* How present the card is: rising in its turn on arrival, going in
         reverse turn on leaving. It only ever eases the card in its place -
         the ring itself never stops. */
      var vis = reduced ? 1 : !started ? 0 : Math.min(1, Math.max(0, (now - startAt - c.order * STEP_IN) / APPEAR));
      if (leaveAt) vis *= 1 - Math.min(1, Math.max(0, (now - leaveAt - (n - 1 - c.order) * STEP_OUT) / VANISH));
      var own = ease(vis);
      var r = R * c.reach * (0.9 + 0.1 * own);
      /* Round the ellipse, then tipped by the roll. Its lower half is the
         near side: cards there sit in front and a touch larger. */
      var ex = Math.cos(a) * r;
      var ey = Math.sin(a) * r * flat;
      var X = ex * cr - ey * sr;
      var Y = ex * sr + ey * cr;
      var Z = Math.sin(a); // -1 far, 1 near

      c.boost += ((c.el === hovered ? 1.1 : 1) - c.boost) * settle;
      var k = (1 + DEPTH * Z) * c.boost * (0.82 + 0.18 * own);

      /* Kept clear of the logo: a card whose rectangle would overlap it is
         carried straight out from the middle, just far enough to clear it -
         so the cards slide round the wordmark and never across it. */
      var dx = X, dy = Y;
      var reachX = (c.w * k) / 2 + LOGO_W;
      var reachY = (c.h * k) / 2 + LOGO_H;
      if (Math.abs(dx) < reachX && Math.abs(dy) < reachY) {
        if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) dy = -1;
        var push = Math.min(Math.abs(dx) > 0.001 ? reachX / Math.abs(dx) : Infinity,
                            Math.abs(dy) > 0.001 ? reachY / Math.abs(dy) : Infinity);
        dx *= push;
        dy *= push;
      }
      /* Solid: no card is ever see-through. Opacity only plays while a
         card is appearing or going. */
      var o = vis < 1 ? own : 1;
      if (Z > frontZ) { frontZ = Z; front = c; }

      c.el.style.transform = "translate3d(" + (cx + dx - c.w / 2).toFixed(1) + "px," +
        (cy + dy - c.h / 2).toFixed(1) + "px,0) scale(" + k.toFixed(3) + ")";
      c.el.style.opacity = o >= 0.999 ? "1" : o.toFixed(3);
      c.el.style.zIndex = String(1000 + Math.round(Z * 100));
    }

    /* With no pointer to point, the label follows the card at the front. */
    if (touchOnly && front && started && now - startAt > (n - 1) * STEP_IN + APPEAR && !leaveAt) label(front.el);
  }

  function frame(now) {
    raf = 0;
    var dt = last ? Math.min((now - last) / 1000, 0.05) : 0.016;
    last = now;
    var f = dt * 60;

    if (!paused && !dragging && now >= holdUntil) {
      yaw += (SPIN + spin) * dt;
      spin *= Math.pow(FRICTION, f);
    }

    /* The ring keeps turning under a still pointer, carrying cards out
       from under it and others in - which the browser does not report as
       the mouse entering or leaving anything. So every few frames, look at
       what is under the pointer now. */
    if (!touchOnly && pointerIn && !dragging && !leaveAt && ++sweep % 6 === 0) {
      var under = document.elementFromPoint(pointerX, pointerY);
      var panel = under && under.closest ? under.closest(".works__track .panel") : null;
      if (!panel) {
        if (hovered || pending) {
          clearTimeout(intent);
          pending = null;
          point(null);
        }
      } else if (panel !== hovered && panel !== pending) {
        clearTimeout(intent);
        pending = panel;
        intent = setTimeout(function () { pending = null; point(panel); }, hovered ? 40 : INTENT);
      }
    }
    leanX += (wantLeanX - leanX) * Math.min(1, 0.06 * f);
    leanY += (wantLeanY - leanY) * Math.min(1, 0.06 * f);

    draw(f);
    if (!paused) raf = requestAnimationFrame(frame);
  }

  function kick() {
    if (!raf && !paused) {
      last = 0;
      raf = requestAnimationFrame(frame);
    }
  }

  /* ============================== the input ============================= */

  window.addEventListener("wheel", function (e) {
    if (paused) return;
    e.preventDefault();
    var by = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    spin = Math.max(-6, Math.min(6, spin + by * WHEEL));
  }, { passive: false });

  /* A press is a click until the hand has really travelled. Only past that
     does it become a drag that takes hold of the ring - so the small slip
     every click has neither turns the ring nor swallows the click, and a
     card clicked opens. */
  var DRAG_FROM = 8; // px the pointer must travel before a press is a drag
  var pressing = false, dragging = false, downX = 0, downY = 0;
  var lastX = 0, lastY = 0, lastT = 0, flick = 0, suppress = 0;
  var pressed = null, pressedAt = 0; // the card the press began on

  stage.addEventListener("pointerdown", function (e) {
    if (paused || e.button > 0) return;
    pressing = true;
    dragging = false;
    pressed = e.target.closest ? e.target.closest(".works__track .panel") : null;
    pressedAt = performance.now();
    downX = lastX = e.clientX;
    downY = lastY = e.clientY;
    lastT = performance.now();
    flick = 0;
  });

  var pointerX = 0, pointerY = 0, pointerIn = false, sweep = 0, pending = null;
  document.addEventListener("mouseleave", function () { pointerIn = false; });

  window.addEventListener("pointermove", function (e) {
    if (e.pointerType === "mouse") {
      pointerX = e.clientX;
      pointerY = e.clientY;
      pointerIn = true;
    }
    if (!touchOnly && !dragging) {
      wantLeanX = (e.clientX / window.innerWidth - 0.5) * LEAN;
      wantLeanY = (e.clientY / window.innerHeight - 0.5) * -LEAN;
    }
    if (!pressing) return;
    if (!dragging) {
      if (Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY) < DRAG_FROM) return;
      dragging = true;
      spin = 0;
      clearTimeout(intent);
      point(null);
    }
    var now = performance.now();
    /* The ring is turned by going round the logo with it: the hand's change
       of angle about the middle of the screen is the ring's turn. */
    var turn = Math.atan2(e.clientY - cy, e.clientX - cx) - Math.atan2(lastY - cy, lastX - cx);
    if (turn > Math.PI) turn -= Math.PI * 2;
    if (turn < -Math.PI) turn += Math.PI * 2;
    yaw += turn;
    var dtt = Math.max(now - lastT, 1) / 1000;
    flick = flick * 0.6 + (turn / dtt) * 0.4;
    lastX = e.clientX;
    lastY = e.clientY;
    lastT = now;
    kick();
  });

  function release() {
    if (!pressing) return;
    pressing = false;
    if (!dragging) return; // a click: left for the card to open
    dragging = false;
    suppress = performance.now() + 250;
    if (performance.now() - lastT < 80) spin = Math.max(-5, Math.min(5, flick));
  }
  window.addEventListener("pointerup", release);
  window.addEventListener("pointercancel", release);

  /* A drag that ends over a card is not a click on it. And a click whose
     card the turning ring carried out from under the pointer before the
     button came up still opens that card: the browser would otherwise
     hand the click to the empty stage, and nothing would happen. */
  stage.addEventListener("click", function (e) {
    if (performance.now() < suppress) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    var on = e.target.closest ? e.target.closest(".works__track .panel") : null;
    if (!on && pressed && pressed.isConnected && performance.now() - pressedAt < 800) {
      var card = pressed;
      pressed = null;
      e.stopPropagation();
      card.click();
    }
  }, true);

  /* ============================== pointing ============================== */

  var clip = null;

  /* Two labels at the foot of the screen - the project's number on the left,
     its name in the middle - which decode to whichever card has focus and
     back to the page's own words when none has. */
  var labelName = document.createElement("p");
  labelName.className = "orbit-label orbit-label--name";
  labelName.setAttribute("aria-live", "polite");
  main.appendChild(labelName);
  var labelled = null;

  /* The name shows only while a card has focus: it decodes in, and fades
     away again when the pointer leaves. */
  function label(panel) {
    if (panel === labelled) return;
    labelled = panel;
    var at = panel ? projects.findIndex(function (p) { return p.id === panel.dataset.project; }) : -1;
    labelName.classList.toggle("is-shown", at >= 0);
    if (at < 0) return;
    var scramble = window.lilvdvmScramble || function (el, t) { el.textContent = t; };
    scramble(labelName, projects[at].name);
  }

  function point(panel) {
    if (panel === hovered) return;
    if (hovered) hovered.classList.remove("is-hovered");
    if (clip) { clip.pause(); clip.remove(); clip = null; }
    hovered = panel;
    track.classList.toggle("has-focus", !!panel && !touchOnly);
    if (!touchOnly) label(panel);
    if (!panel) return;
    panel.classList.add("is-hovered");
    if (touchOnly) return;
    var project = projects.find(function (p) { return p.id === panel.dataset.project; });
    if (!project || !project.preview) return;
    var v = document.createElement("video");
    v.className = "panel__clip";
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.setAttribute("aria-hidden", "true");
    v.src = project.preview;
    v.addEventListener("playing", function () { v.classList.add("is-playing"); });
    v.addEventListener("canplay", function () {
      if (v.paused && clip === v) { var again = v.play(); if (again && again.catch) again.catch(function () {}); }
    });
    panel.querySelector(".panel__frame").appendChild(v);
    var played = v.play();
    if (played && played.catch) played.catch(function () {});
    clip = v;
  }

  /* Focus is given after the pointer has rested a moment, not the instant it
     crosses a card - sweeping across the ball should not set every card it
     passes flaring and dimming in turn. Losing it is immediate. */
  var intent = 0;
  track.addEventListener("mouseover", function (e) {
    if (dragging || paused || touchOnly || leaveAt) return;
    var panel = e.target.closest(".panel");
    clearTimeout(intent);
    if (panel === hovered) return;
    pending = panel;
    intent = setTimeout(function () { pending = null; point(panel); }, hovered ? 40 : INTENT);
  });
  track.addEventListener("mouseout", function (e) {
    var to = e.relatedTarget && e.relatedTarget.closest ? e.relatedTarget.closest(".panel") : null;
    if (!to) {
      clearTimeout(intent);
      pending = null;
      point(null);
    }
  });

  /* ======================= the project view's needs ===================== */

  /* Turns the ring so the given card comes round to the front - the foot of
     the ring, where it leans nearest. */
  function face(card) {
    yaw = Math.PI / 2 - card.angle;
    spin = 0;
    draw();
  }

  window.addEventListener("works:pause", function () {
    paused = true;
    point(null);
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  });

  /* Closing a project flies its picture back to its card, which takes about
     a second. The ring holds still until it has landed - otherwise the card
     would have turned away from the spot the picture is flying to - and
     then sets off again. */
  var HOLD = 1050;
  var holdUntil = 0;

  window.addEventListener("works:resume", function () {
    paused = false;
    holdUntil = performance.now() + HOLD;
    kick();
  });

  /* A project about to close needs its card on screen to fly back to - and
     every card on the ring always is, so the ring is left where it was. */
  /* Only a card reached with the Tab key is turned to the front. A click
     also focuses the card it lands on, and the project hands focus back to
     its card on closing - neither of those may turn the ring, or the card
     would swing away from under the pointer, or from under the picture
     flying home to it. */
  var tabbing = false;
  document.addEventListener("keydown", function (e) { if (e.key === "Tab") tabbing = true; });
  document.addEventListener("pointerdown", function () { tabbing = false; }, true);

  track.addEventListener("focusin", function (e) {
    if (!tabbing || paused || html.classList.contains("project-open")) return;
    var panel = e.target.closest(".panel");
    var card = cards.find(function (c) { return c.el === panel; });
    if (card) face(card);
  });

  /* ============================ arriving, leaving ======================= */

  function start() {
    if (started) return;
    started = true;
    label(null);
    main.classList.add("is-open");
    startAt = performance.now();
    spin = 0.5; // a little more way on as it opens, settling to its own pace
    kick();
  }

  window.addEventListener("slide:leave", function (e) {
    if (html.classList.contains("project-open") || reduced) return;
    clearTimeout(intent);
    point(null);
    main.classList.add("is-leaving");
    leaveAt = performance.now();
    kick();
    e.detail.wait = (cards.length - 1) * STEP_OUT + VANISH;
  });

  window.addEventListener("pageshow", function (e) {
    if (!e.persisted) return;
    leaveAt = 0;
    main.classList.remove("is-leaving");
    kick();
  });

  window.addEventListener("resize", function () {
    measure();
    draw();
  });

  window.addEventListener("works:images-ready", build);
  build();
  draw();
  kick();

  /* Held until the loading screen hands the page over, when there is one. */
  if (reduced) start();
  else if (html.classList.contains("is-loaded")) setTimeout(start, 60);
  else document.addEventListener("site:revealed", start, { once: true });
  setTimeout(start, 6000);
})();

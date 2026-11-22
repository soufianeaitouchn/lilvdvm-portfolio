/* -----------------------------------------------------------------------------
   Cursor.

   Two layers: a small dot that tracks the pointer exactly, and a ring that
   trails it. Over anything clickable the ring stops following the pointer,
   snaps to that element and squares itself off into a rounded rectangle around
   it, so the target feels caught rather than merely pointed at.

   The ring blends by difference, which is why it stays legible over the black
   field, the white loading band and the footage alike without ever choosing a
   colour of its own.
----------------------------------------------------------------------------- */

(function () {
  "use strict";

  /* Nothing here is any use to a finger, and a coarse pointer has no hover
     state to express - so on touch the native behaviour is left alone. */
  if (!window.matchMedia || !matchMedia("(any-pointer: fine)").matches) return;
  if (matchMedia("(max-width: 1024px)").matches) return;

  var RING = 36; // resting diameter
  var PAD = 10; // a little room around what it has caught
  var EASE_POS = 0.1; // how hard the ring chases the pointer - low, so it trails
  var EASE_BOX = 0.22; // ...and how hard it takes a target's shape

  /* The corner radius is never animated separately: it is always half the
     shorter side, so the shape is a true pill at rest (a circle) and a true
     pill when wrapped - and every frame in between is correct by construction
     rather than by two eased values happening to agree. */

  var TRIGGERS = "a, button, [data-cursor]";

  /* Anything carrying data-hint swaps the ring for a labelled pill at the
     pointer - the label is whatever the attribute says. */
  var HINTS = "[data-hint]";

  /* Opted out of the morph: the ring stays a plain circle and simply follows.
     The wordmark is left alone because wrapping it would put a pill around the
     identity every time the pointer crossed the corner; the call to action
     because it is nearly the width of the screen, and a pill that size stops
     reading as a cursor at all. */
  var IGNORE =
    ".logo, .cta, [data-cursor='none']," +
    /* The gallery photographs are left to the plain ring. Wrapping a picture
       in a rounded rectangle read as the cursor grabbing the artwork; over
       stills it should stay a circle and simply point. */
    " .wall__tile," +
    /* And the cover over the YouTube film, for the same reason and more so:
       it is a button, so the ring would wrap it, and it is a full-width
       sixteen-by-nine tile - a pill that size is not a cursor, it is a frame
       drawn around the picture. The play mark on the cover already says it
       can be pressed. */
    " .project__youtube-cover";

  var root = document.documentElement;

  var ring = document.createElement("div");
  ring.className = "cursor cursor--ring";
  ring.setAttribute("aria-hidden", "true");

  var dot = document.createElement("div");
  dot.className = "cursor cursor--dot";
  dot.setAttribute("aria-hidden", "true");

  var hint = document.createElement("div");
  hint.className = "cursor cursor--hint";
  hint.setAttribute("aria-hidden", "true");

  /* The pill's visible half. It grows on its own transform while the element
     above it holds the position - see the note in the stylesheet for why the
     two cannot share one. */
  var hintBody = document.createElement("span");
  hintBody.className = "cursor--hint__body";
  hint.appendChild(hintBody);

  document.body.appendChild(ring);
  document.body.appendChild(hint);
  document.body.appendChild(dot); // last, so difference-blends over the pill

  /* Parked off screen rather than left at its natural 0,0. Until a pointer
     position exists there is nowhere sensible to put it, and the top-left
     corner is the one place it must never open from. */
  hint.style.transform = "translate3d(-200px,-200px,0) translate(-50%,-50%)";

  /* Only now is the native cursor taken away: if this script never ran, the
     page is still perfectly usable with the ordinary pointer. */
  root.classList.add("has-cursor");

  var px = 0; // pointer
  var py = 0;
  var awake = false;

  var now = { x: 0, y: 0, w: RING, h: RING };
  var want = { x: 0, y: 0, w: RING, h: RING };

  var target = null; // the element currently caught
  var hinted = null; // ...and the one asking for a pill instead
  var running = false;
  var scrolling = false; // true from a scroll until the pointer next moves

  function wake() {
    if (awake) return;
    awake = true;
    now.x = want.x = px;
    now.y = want.y = py;
    now.w = want.w = RING;
    now.h = want.h = RING;
    ring.style.width = RING + 'px';
    ring.style.height = RING + 'px';
    ring.style.borderRadius = '50%';
    ring.style.transform = 'translate3d(' + px + 'px,' + py + 'px,0) translate(-50%,-50%)';
    dot.style.transform = 'translate3d(' + px + 'px,' + py + 'px,0) translate(-50%,-50%)';
    /* Brought to the pointer before anything can be shown there. */
    hint.style.transform =
      "translate3d(" + px + "px," + py + "px,0) translate(-50%,-50%)";
    ring.classList.add("is-awake");
    dot.classList.add("is-awake");
  }

  function onMove(e) {
    if (document.hidden || !document.hasFocus()) return;
    px = e.clientX;
    py = e.clientY;
    /* A genuine pointer move ends the scroll's hold, so the ring can catch and
       wrap things again from wherever the hand now is. */
    scrolling = false;
    wake();
    root.classList.remove('cursor-suspended');
    hold(e.target);
    kick();
  }

  function catches(el) {
    var t = el && el.closest ? el.closest(TRIGGERS) : null;
    if (t && t.matches(IGNORE)) return null;
    return t;
  }

  /* What the ring should wrap: the letters, not the element's box.

     The links in the centre row are deliberately padded out to matching widths
     so the wordmark lands on the exact centre of the screen - INFOS is carried
     in a box the width of WORKS. Wrapping that box put the pill wider than the
     word and sitting off to one side of it.

     So when a target has been split into letters, the run of letters is
     measured instead. Anything else - a plain link, a button - has no such
     slack and answers with its own box. */
  function ink(el) {
    var parts = el.querySelectorAll(".ltr");
    if (!parts.length) return el.getBoundingClientRect();

    var left = Infinity;
    var right = -Infinity;
    var top = Infinity;
    var bottom = -Infinity;

    for (var i = 0; i < parts.length; i++) {
      var r = parts[i].getBoundingClientRect();
      if (r.left < left) left = r.left;
      if (r.right > right) right = r.right;
      if (r.top < top) top = r.top;
      if (r.bottom > bottom) bottom = r.bottom;
    }

    return { left: left, top: top, width: right - left, height: bottom - top };
  }

  /* Derived from the element under the pointer, not from the morph target:
     an element can opt out of the ring wrapping it and still ask for a pill. */
  function hold(el) {
    var h = el && el.closest ? el.closest(HINTS) : null;

    if (h !== hinted) {
      hinted = h;
      if (h) {
        hintBody.textContent = h.getAttribute("data-hint") || "";
        /* Placed before it is shown, so it opens under the pointer rather than
           becoming visible for a frame wherever it was last left. */
        hint.style.transform =
          "translate3d(" + px + "px," + py + "px,0) translate(-50%,-50%)";
        hint.classList.add("is-shown");
      } else {
        hint.classList.remove("is-shown");
      }
      kick();
    }

    /* A scroll under a still pointer fires synthetic mouseover/mouseout for
       whatever slides beneath it. Catching on those would let the ring wrap an
       element the reader never pointed at and then ride it off the screen - the
       very drift the scroll handler exists to stop. While a scroll is in flight
       the catch is left as it is; a real pointer move clears the flag at once. */
    if (scrolling) return;

    var t = catches(el);
    if (t === target) return;
    target = t;
    kick();
  }

  /* Boundary events are dispatched BEFORE the mousemove that caused them, so at
     this point px/py still hold wherever the pointer last was - which is why the
     pill used to open at the previous element and fly across. Take the position
     from this event instead. */
  function onOver(e) {
    if (document.hidden || !document.hasFocus() || root.classList.contains('cursor-suspended')) return;
    if (typeof e.clientX === "number") {
      px = e.clientX;
      py = e.clientY;
      wake();
    }
    hold(e.target);
  }

  /* Read from what is being entered, not from what is being left - otherwise
     leaving a target re-finds that same target and the ring stays wrapped for
     an extra event. */
  function onOut(e) {
    hold(e.relatedTarget);
  }

  function onLeave() {
    // Hide immediately on tab switches; stale hover events must not flash it back.
    root.classList.add('cursor-suspended');
    awake = false;
    target = null;
    hinted = null;
    hint.classList.remove("is-shown");
    ring.classList.remove("is-awake");
    dot.classList.remove("is-awake");
  }

  /* Scrolling does not move the pointer, so no mousemove fires - but the frame
     loop keeps measuring a caught element's box every frame, and as the page
     scrolls that box slides away under the still pointer. The ring, chasing it,
     appeared to drift off on its own. So on scroll the catch is dropped and the
     ring is put back on the pointer where it actually is: it stays a plain
     circle, sitting still under the hand, until the pointer is moved again. */
  function onScroll() {
    if (!awake) return;
    scrolling = true;
    target = null;
    want.x = px;
    want.y = py;
    want.w = RING;
    want.h = RING;
    /* Snap, do not ease: the ring belongs on the pointer immediately, not eased
       across from wherever the caught element had dragged it to. */
    now.x = px;
    now.y = py;
    now.w = RING;
    now.h = RING;
    kick();
  }

  document.addEventListener("mousemove", onMove, { passive: true });
  document.addEventListener("mouseover", onOver, { passive: true });
  document.addEventListener("mouseout", onOut, { passive: true });
  document.addEventListener("mouseleave", onLeave);
  document.addEventListener("scroll", onScroll, { passive: true, capture: true });
  window.addEventListener("blur", onLeave);
  window.addEventListener('pagehide', onLeave);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) onLeave();
  });

  function frame() {
    /* Measured every frame rather than on hover alone, so the ring stays
       wrapped correctly if the page scrolls or the layout moves under it. */
    if (target && target.isConnected) {
      var r = ink(target);
      want.x = r.left + r.width / 2;
      want.y = r.top + r.height / 2;
      want.w = r.width + PAD * 2;
      want.h = r.height + PAD * 2;
    } else {
      target = null;
      want.x = px;
      want.y = py;
      want.w = RING;
      want.h = RING;
    }

    now.x += (want.x - now.x) * EASE_POS;
    now.y += (want.y - now.y) * EASE_POS;
    now.w += (want.w - now.w) * EASE_BOX;
    now.h += (want.h - now.h) * EASE_BOX;

    ring.style.width = now.w.toFixed(1) + "px";
    ring.style.height = now.h.toFixed(1) + "px";
    ring.style.borderRadius = (Math.min(now.w, now.h) / 2).toFixed(1) + "px";
    ring.style.transform =
      "translate3d(" + now.x.toFixed(1) + "px," + now.y.toFixed(1) + "px,0) translate(-50%,-50%)";

    /* The dot never lags and never gets caught - it is the actual pointer. */
    dot.style.transform =
      "translate3d(" + px + "px," + py + "px,0) translate(-50%,-50%)";

    /* Pinned to the pointer itself, not to the ring's eased position - and
       updated whether it is showing or not.

       Riding the ring meant the pill appeared wherever the cursor had last
       settled and then flew across to catch up. Updating it only while shown
       had the same fault one step earlier: it sat wherever it was last left -
       at the corner it was created in, on the first hover of the page - and
       jumped to the hand on the frame after opening. Kept on the pointer
       always, there is no position for it to open from but the right one. */
    hint.style.transform =
      "translate3d(" + px + "px," + py + "px,0) translate(-50%,-50%)";

    var settled =
      Math.abs(want.x - now.x) < 0.1 &&
      Math.abs(want.y - now.y) < 0.1 &&
      Math.abs(want.w - now.w) < 0.1 &&
      Math.abs(want.h - now.h) < 0.1;

    if (settled && !target && !hinted) {
      running = false;
      return;
    }
    requestAnimationFrame(frame);
  }

  function kick() {
    if (running) return;
    running = true;
    requestAnimationFrame(frame);
  }
})();

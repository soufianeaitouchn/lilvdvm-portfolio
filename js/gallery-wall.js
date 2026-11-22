/* -----------------------------------------------------------------------------
   Gallery: the wall.

   Every photograph at once, in uneven tiles that keep each one's own shape,
   laid into columns so the wall comes out level. A tap opens a photo on its
   own, full screen; from there a swipe, an arrow key or the buttons go to the
   next or the last, and Escape, Close, a tap on the black or a swipe down
   puts it back.

   Everything here builds elements and sets text; nothing is written as HTML.
----------------------------------------------------------------------------- */

(function () {
  "use strict";

  var wall = document.querySelector("[data-wall]");
  var pictures = window.galleryPictures;
  if (!wall || !pictures) return;

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var PHOTOS = [
    "p22", "p15", "p07", "p02", "p04", "p05", "p06", "p08", "p10", "p11", "p12", "p14",
    "p16", "p17", "p18", "p20", "p21", "p23", "p24", "p25"
  ];

  var photos = PHOTOS.filter(function (id) { return pictures[id]; }).map(function (id) {
    return pictures[id];
  });
  var total = photos.length;
  if (!total) return;

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function srcset(photo) {
    return photo.sources.map(function (s) { return s.src + " " + s.width + "w"; }).join(", ");
  }

  /* ================================ tiles ================================ */

  var tiles = photos.map(function (photo, i) {
    var tile = document.createElement("button");
    tile.type = "button";
    tile.className = "wall__tile";
    tile.setAttribute("aria-label", "Open photograph " + (i + 1) + " of " + total);
    tile.style.aspectRatio = photo.width + " / " + photo.height;
    var img = document.createElement("img");
    img.alt = "";
    img.decoding = "async";
    img.loading = "lazy";
    img.draggable = false;
    img.width = photo.width;
    img.height = photo.height;
    img.addEventListener("load", function () { tile.classList.add("is-loaded"); });
    tile.appendChild(img);
    tile.addEventListener("click", function () { open(i); });
    return { el: tile, img: img, photo: photo };
  });

  /* Columns by width; each photo goes into whichever column is shortest, so
     the wall reads left to right and comes out level at the foot. */
  var columns = 0;

  function columnCount() {
    var w = window.innerWidth;
    return w >= 1200 ? 4 : w >= 760 ? 3 : 2;
  }

  function layout() {
    var n = columnCount();
    if (n === columns) return;
    columns = n;
    wall.textContent = "";
    var cols = [];
    var heights = [];
    for (var c = 0; c < n; c++) {
      var col = document.createElement("div");
      col.className = "wall__col";
      wall.appendChild(col);
      cols.push(col);
      heights.push(0);
    }
    var colWidth = Math.ceil(wall.clientWidth / n);
    tiles.forEach(function (t) {
      var shortest = heights.indexOf(Math.min.apply(null, heights));
      cols[shortest].appendChild(t.el);
      heights[shortest] += t.photo.height / t.photo.width;
      t.img.sizes = colWidth + "px";
      if (!t.img.srcset) {
        t.img.srcset = srcset(t.photo);
        t.img.src = t.photo.sources[0].src;
      }
    });
  }

  /* ================================ viewer =============================== */

  var viewer = document.createElement("div");
  viewer.className = "viewer";
  viewer.hidden = true;
  viewer.setAttribute("role", "dialog");
  viewer.setAttribute("aria-modal", "true");
  viewer.setAttribute("aria-label", "Photograph");

  var frame = document.createElement("div");
  frame.className = "viewer__frame";
  var big = document.createElement("img");
  big.className = "viewer__img";
  big.alt = "";
  big.decoding = "async";
  big.draggable = false;
  frame.appendChild(big);

  function control(cls, text, label) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "viewer__btn " + cls;
    b.textContent = text;
    if (label) b.setAttribute("aria-label", label);
    return b;
  }
  var close = control("viewer__close", "Close");
  var prev = control("viewer__prev", "Prev", "Previous photograph");
  var next = control("viewer__next", "Next", "Next photograph");
  var count = document.createElement("p");
  count.className = "viewer__count";
  count.setAttribute("aria-live", "polite");
  var foot = document.createElement("div");
  foot.className = "viewer__foot";
  foot.append(prev, count, next);

  viewer.append(frame, close, foot);
  document.body.appendChild(viewer);

  var at = -1;
  var opener = null;

  function show(i) {
    at = (i + total) % total;
    var photo = photos[at];
    big.classList.remove("is-loaded");
    // the tile's copy is already here, so something shows at once
    big.removeAttribute("srcset");
    big.src = tiles[at].img.currentSrc || photo.sources[0].src;
    big.width = photo.width;
    big.height = photo.height;
    big.sizes = "92vw";
    big.srcset = srcset(photo);
    var label = pad(at + 1) + " / " + pad(total);
    if (window.lilvdvmScramble && !reduced) window.lilvdvmScramble(count, label);
    else count.textContent = label;
    // the neighbours are fetched ahead, so the next one is never waiting
    [at + 1, at - 1].forEach(function (k) {
      var p = photos[(k + total) % total];
      var pre = new Image();
      pre.sizes = "92vw";
      pre.srcset = srcset(p);
    });
  }
  big.addEventListener("load", function () { big.classList.add("is-loaded"); });

  function open(i) {
    opener = tiles[i].el;
    show(i);
    viewer.hidden = false;
    document.documentElement.classList.add("viewer-open");
    if (window.lenis && window.lenis.stop) window.lenis.stop();
    requestAnimationFrame(function () { viewer.classList.add("is-open"); });
    close.focus({ preventScroll: true });
  }

  function shut() {
    if (viewer.hidden) return;
    viewer.classList.remove("is-open");
    document.documentElement.classList.remove("viewer-open");
    if (window.lenis && window.lenis.start) window.lenis.start();
    setTimeout(function () { viewer.hidden = true; }, reduced ? 0 : 350);
    if (opener) opener.focus({ preventScroll: true });
  }

  close.addEventListener("click", shut);
  prev.addEventListener("click", function () { show(at - 1); });
  next.addEventListener("click", function () { show(at + 1); });
  big.addEventListener("click", function () { show(at + 1); });
  viewer.addEventListener("click", function (e) {
    if (e.target === viewer || e.target === frame) shut();
  });

  document.addEventListener("keydown", function (e) {
    if (viewer.hidden) return;
    if (e.key === "Escape") { e.preventDefault(); shut(); }
    else if (e.key === "ArrowRight") { e.preventDefault(); show(at + 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); show(at - 1); }
    else if (e.key === "Tab") {
      // keep focus inside the viewer while it is open
      var stops = [close, prev, next];
      var k = stops.indexOf(document.activeElement);
      e.preventDefault();
      stops[(k + (e.shiftKey ? stops.length - 1 : 1)) % stops.length].focus();
    }
  });

  /* Swipe sideways for the next or the last; swipe down to put it back. */
  var sx = null, sy = null;
  viewer.addEventListener("touchstart", function (e) {
    if (e.touches.length !== 1) { sx = null; return; }
    sx = e.touches[0].clientX;
    sy = e.touches[0].clientY;
  }, { passive: true });
  viewer.addEventListener("touchmove", function (e) { e.preventDefault(); }, { passive: false });
  viewer.addEventListener("touchend", function (e) {
    if (sx === null || !e.changedTouches.length) return;
    var dx = e.changedTouches[0].clientX - sx;
    var dy = e.changedTouches[0].clientY - sy;
    sx = sy = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) show(at + (dx < 0 ? 1 : -1));
    else if (dy > 80 && dy > Math.abs(dx)) shut();
  }, { passive: true });

  /* ================================ start ================================ */

  layout();
  var resizeTimer;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      var colWidth = Math.ceil(wall.clientWidth / columnCount()) + "px";
      layout();
      tiles.forEach(function (t) { t.img.sizes = colWidth; });
    }, 150);
  });
})();

/* -----------------------------------------------------------------------------
   Navigation: a per-letter vertical roll on hover.

   The ink colour is no longer computed here. It is done in the stylesheet with
   mix-blend-mode: difference, which inverts the footage per pixel rather than
   picking one colour for the whole word - see the header rules in style.css.
   All this file does is split the words and keep the background playing.
----------------------------------------------------------------------------- */

(function () {
  "use strict";

  // Referrers can be absent in local previews or with privacy settings. Record
  // the actual destination so its head can skip the loader before first paint.
  document.addEventListener('click', function (event) {
    if (event.defaultPrevented || event.button > 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    var link = event.target.closest('a[href]');
    if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
    var destination = new URL(link.href, location.href);
    if (destination.origin !== location.origin || destination.protocol !== location.protocol ||
        new URL('.', destination).href !== new URL('.', location.href).href ||
        !/\/(?:index|works|infos|contact|gallery)\.html$/.test(destination.pathname) ||
        (destination.pathname === location.pathname && destination.search === location.search)) return;
    try {
      sessionStorage.setItem('lilvdvm:internal-navigation', JSON.stringify({
        destination: destination.pathname + destination.search, time: Date.now()
      }));
    } catch (e) {}
  });

  /* ============================= the roll =============================== */

  /* Each letter sits in a box clipped to exactly one line, and carries a copy
     of itself one line below via text-shadow. Rolling the letter up by 100%
     therefore slides its twin into the slot it just left - a seamless vertical
     roll with no duplicated markup. The movement itself is pure CSS, so this
     script only has to split the words and number the letters. */

  var STAGGER = 30; // ms between neighbouring letters

  /* Splitting a word into inline-blocks costs the kerning between every pair,
     which widens each word by a pixel or so and would drag the whole nav off
     the positions taken from the PSD. So measure the kerned advance of every
     character first, then hand each split letter that exact width back. */
  function kernedAdvances(link, text) {
    var node = link.firstChild;
    if (!node || node.nodeType !== 3) return null;

    var range = document.createRange();
    var pens = [];
    for (var i = 0; i < text.length; i++) {
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      pens.push(range.getBoundingClientRect().left);
    }
    pens.push(link.getBoundingClientRect().right);

    var out = [];
    for (var j = 0; j < text.length; j++) out.push(pens[j + 1] - pens[j]);
    return out;
  }

  document.documentElement.style.setProperty("--roll-stagger", STAGGER + "ms");

  [].slice.call(document.querySelectorAll(".nav__link")).forEach(function (link) {
    var text = link.textContent.trim();
    if (!text) return;

    var kerned = kernedAdvances(link, text);
    link.setAttribute("aria-label", text);

    var frag = document.createDocumentFragment();
    var boxes = [];
    for (var i = 0; i < text.length; i++) {
      var box = document.createElement("span");
      box.className = "ltr";
      box.setAttribute("aria-hidden", "true");
      box.style.setProperty("--i", i);

      var glyph = document.createElement("span");
      glyph.className = "ltr__g";
      glyph.textContent = text[i];

      box.appendChild(glyph);
      frag.appendChild(box);
      boxes.push(box);
    }

    link.textContent = "";
    link.appendChild(frag);

    if (kerned) {
      var natural = boxes.map(function (b) {
        return b.getBoundingClientRect().width;
      });
      for (var k = 0; k < boxes.length; k++) {
        var fix = kerned[k] - natural[k];
        if (Math.abs(fix) > 0.001) boxes[k].style.marginRight = fix.toFixed(3) + "px";
      }
    }
  });

  /* ==================== the centre row on the home page ================= */

  /* Five words spread edge to edge with space-between give four identical
     gaps, but the wordmark only lands on the exact centre line if the two
     words to its left measure the same as the two to its right - and GALLERY,
     WORKS, INFOS, CONTACT do not, by a handful of pixels.

     So each flanking pair is measured and both members given the wider of the
     two. The slack is added on the inside of each pair, where the gaps absorb
     it, and the row becomes symmetrical by construction rather than by luck.
     Done here because it has to happen after the letters are split, which is
     what restores their kerned widths. */
  [].slice.call(document.querySelectorAll(".herolinks")).forEach(function (row) {
    var links = [].slice.call(row.querySelectorAll(".nav__link"));

    if (links.length === 4) {
      var balance = function () {
        row.style.removeProperty("--outer-w");
        row.style.removeProperty("--inner-w");

        var natural = links.map(function (a) {
          return a.getBoundingClientRect().width;
        });

        /* Stacked into a column, where there is no shared line for the widths
           to balance across and padding a word out would just look like a
           typo. Detected by asking whether the five still share a line rather
           than by repeating the breakpoint, so the two cannot drift apart. */
        var kids = row.children;
        if (kids[0].offsetTop !== kids[kids.length - 1].offsetTop) return;

        var outer = Math.max(natural[0], natural[3]);
        var inner = Math.max(natural[1], natural[2]);

        row.style.setProperty("--outer-w", outer.toFixed(3) + "px");
        row.style.setProperty("--inner-w", inner.toFixed(3) + "px");
      };

      balance();

      /* The webfont changes every advance width in the row. */
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(balance);

      var pending = 0;
      window.addEventListener("resize", function () {
        clearTimeout(pending);
        pending = setTimeout(balance, 150);
      });
    }
  });

  /* ====================== keep the footage running ====================== */

  /* The video carries no autoplay attribute, so it sits on its poster frame -
     its own first frame - behind the black, and opens from the beginning
     rather than a second or two in.

     Muted playback is normally allowed without a gesture, but it is deferred
     in a background tab and refused outright under some settings - so ask
     again on the first real interaction, and whenever the tab comes forward. */
  var source = document.querySelector("[data-contrast-source]");
  if (!source || source.tagName !== "VIDEO") return;
  /* Infos owns its paused, scroll-driven video timeline. */
  if (source.classList.contains("infos__video")) return;

  function nudge() {
    if (!source.paused || document.hidden || source.dataset.mediaVisible === 'false') return;
    var playing = source.play();
    if (playing && typeof playing.catch === "function") playing.catch(function () {});
  }

  /* Everything that might mean the browser will allow it now.

     Asking once was the mistake. A refused play is not a permanent no - it is
     a no for that moment - and the moments this is asked in are exactly the
     awkward ones: a page arrived at from inside the site, where there is no
     loading screen to wait behind and the film is asked for while the document
     is still being parsed; a tab that was in the background; a page a browser
     suspended on its way into the back/forward cache and has now handed back.
     One chance in any of those is no chance at all, and the film sits on its
     first frame looking like a photograph.

     So it keeps asking, on anything that plausibly changes the answer, until
     the film reports that it is actually running - and then stops asking. Each
     attempt costs a comparison while it is playing, which is nothing. */
  var WAKE = ["pointerdown", "touchstart", "keydown", "wheel", "scroll", "click"];

  function listen() {
    for (var i = 0; i < WAKE.length; i++) {
      window.addEventListener(WAKE[i], nudge, { passive: true });
    }
  }

  function enough() {
    for (var i = 0; i < WAKE.length; i++) window.removeEventListener(WAKE[i], nudge);
  }

  source.addEventListener("playing", function () {
    stumbles = 0;
    enough();
  });

  /* Keep it running.

     Nothing on this site ever pauses this film - it has no controls, it loops
     for ever, and no code here calls pause on it. So a pause is always the
     browser: a tab sent to the background, a page frozen on its way into the
     back/forward cache, a laptop saving power, a codec hiccup. Where the page
     is in front of somebody, that is not a decision worth honouring - start it
     again at once rather than waiting to be prodded by a scroll or a click.

     Only while the page is visible, though. A hidden page is one the browser
     has every right to stop, and arguing with it there would be a loop that
     spends battery to show nobody anything - so there it simply arms the
     listeners and waits to be handed back.

     And only a few times in a row. If a browser is refusing outright, asking
     again on every refusal is a spin rather than a fix; after a few attempts
     it falls back to the listeners, and any of the ways the page comes back to
     life clears the count and starts it over. */
  var CHANCES = 4;
  var stumbles = 0;
  var since = 0;

  source.addEventListener("pause", function () {
    if (!released) return;

    listen(); // the net, whatever happens next
    if (document.hidden) return;

    var now = Date.now();
    if (now - since > 2000) { since = now; stumbles = 0; }
    if (++stumbles > CHANCES) return;

    nudge();
  });

  /* Coming back to life, by whichever route.

     Going back to a page is not the same as opening one. A browser does not
     reload it: it keeps the whole document alive in the back/forward cache,
     frozen, and hands the same one back. None of this file runs again, because
     it already ran - and freezing a page pauses whatever it was playing. So
     nothing on the page notices it has returned unless it is told, and being
     told is the entire job here.

     Three ways it can be told, because browsers differ over which they send:
     pageshow with its persisted flag set, the page lifecycle resume event, and
     the tab simply becoming visible again. Any of them means the same thing. */
  /* Coming back to the page is an arrival, and an arrival opens on the first
     frame - the same as walking in off a link or off the loading screen. A film
     picked up two thirds of the way through is a film somebody has already
     watched; from the top it is the page opening.

     A tab merely coming forward is not an arrival. Nobody went anywhere, and
     restarting the film under them every time they glanced at another window
     would be its own kind of broken - so that carries on where it left off. */
  function wake(arriving) {
    stumbles = 0; // a fresh set of chances every time the page comes back

    if (arriving) {
      try {
        source.currentTime = 0;
      } catch (e) {}
    }

    listen();
    nudge();
  }

  window.addEventListener("pageshow", function (e) {
    /* persisted is what separates a page handed back from the cache from an
       ordinary load, and the distinction matters both ways.

       A restore must always act: that page was demonstrably running a moment
       ago, so there is no first arrival to protect and nothing to wait for.
       Testing whether the loading screen had finished - which is what this did
       - asks a question about a visit that is already over.

       An ordinary load must not act, or this becomes what starts the film on a
       first arrival, ahead of the black, and the opening frame is lost. */
    /* persisted means the page was handed back rather than loaded: the reader
       has returned to it, so it opens from the top. */
    if (e && e.persisted) wake(true);
    else if (released) wake(false);
  });

  /* Chrome freezes a page outright rather than merely hiding it, and thaws it
     again on the way back. This is the precise moment it becomes live. */
  document.addEventListener("resume", function () {
    /* A thaw is not necessarily a return - Chrome freezes backgrounded tabs
       too - so this only picks the film up where it stopped. Where it really
       was a return, pageshow has already rewound it. */
    wake(false);
  });

  /* And the tab simply coming back to the front, which is where a browser is
     most likely to have stopped it. */
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) return;
    if (released) wake(false);
  });

  /* A history move within one document. These pages are separate documents, so
     this is not how back reaches the home page today - but it costs nothing and
     means the film is not relying on that staying true. */
  window.addEventListener("popstate", function () {
    if (released) wake(true);
  });

  /* The loader pins this on its way in, so a reload opens at the top rather
     than wherever the reader had got to. Arriving from inside the site there is
     no loader to do it, and the home page would open partway down - which looks
     like the film missing rather than the page being scrolled. */
  if (!document.documentElement.classList.contains("has-loader") &&
      "scrollRestoration" in history) {
    history.scrollRestoration = "manual";
    window.scrollTo(0, 0);
  }

  var released = false;

  function release() {
    if (released) return;
    released = true;

    /* Whether this page was held behind a loading screen, or arrived at from
       inside the site. The two want opposite things here. */
    var wasHeld = document.documentElement.classList.contains("has-loader");

    if (wasHeld) {
      /* Nothing should have moved it, but a reload can restore a position -
         and the point of waiting was to open on the first frame. */
      if (source.currentTime > 0) {
        try {
          source.currentTime = 0;
        } catch (e) {}
      }

      /* Held until now, so this is what starts it - and by now the loader has
         waited on the film itself, so there is certainly something to play. */
      nudge();
    }

    /* Arrived from inside the site: the element carries autoplay and the
       browser will start the film the moment it is ready and allowed.
       Deliberately nothing is asked here, and that is the whole fix.

       Asking was worse than not asking. Calling play() clears the element's
       own permission to start itself - the specification takes the call as the
       page having taken charge - and this runs while the document is still
       being parsed, when the element has no frame to show and the call fails.
       So the request came to nothing AND the autoplay that would have worked a
       moment later had been cancelled by making it. The film sat on its poster
       until something else asked again, which is why it appeared to need a
       scroll to start. */

    listen();

    /* A net under both paths, for a browser that refuses autoplay outright.
       These fire when there genuinely is something to play, so a call from
       here can succeed where one at parse time could not. */
    source.addEventListener("loadeddata", nudge);
    source.addEventListener("canplay", nudge);
  }

  /* Held until the loading screen hands the page over. The black is opaque
     while it is up, so a film running behind it would only be playing to
     nobody - and would be some way in by the time it was uncovered.

     "Finished" here means the moment the curtains START parting, not the
     moment they have finished: the parting takes over a second, and a still
     frame sliding into view before it moves would give the whole thing away as
     an image. site:revealed is dispatched at exactly that moment, so the film
     is already running as the black draws back off it. */
  if (document.documentElement.classList.contains("is-loaded")) release();
  else document.addEventListener("site:revealed", release, { once: true });

  /* The loader resolves itself even if assets never load, so this should never
     be what starts the film. It is here so that a missing or broken loader
     cannot leave the background frozen on a still for good. */
  setTimeout(release, 12000);
})();

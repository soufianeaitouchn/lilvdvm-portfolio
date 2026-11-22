/* -----------------------------------------------------------------------------
   Contact form.

   Three things, all of them borrowed from the reference page:

   - Each field box carries a state. Focused or holding a value, its border
     darkens, its label darkens, and - on the boxes whose label sits over the
     typing area - the label shrinks to get out of the way. The movement itself
     is CSS on a single 0.28s ease-in-out; this only decides which state the box
     is in.
   - The grid of fields is invisible until the page has settled, then fades in
     after a beat.
   - A failed field turns flat pink rather than growing a coloured edge.

   Sending goes to whatever the form's data-endpoint names - Web3Forms, which
   emails the message on. Without an endpoint the form says it is not
   connected rather than look as though a message went somewhere.
----------------------------------------------------------------------------- */

(function () {
  "use strict";

  var form = document.querySelector(".cform");
  if (!form) return;

  var root = document.documentElement;

  /* ========================== field states ============================== */

  var items = [].slice.call(form.querySelectorAll("[data-item]"));

  function controls(item) {
    return [].slice.call(item.querySelectorAll("input, textarea"));
  }

  /* A box counts as holding something if any control inside it does - the
     contact box has two, and the company box has the site field under it. */
  function filled(item) {
    return controls(item).some(function (el) {
      if (el.type === "file") return el.files && el.files.length > 0;
      return el.value.trim() !== "";
    });
  }

  /* The line under a field that says what is wrong with it - written as text,
     never as markup. */
  function explain(item, message) {
    var line = item.querySelector("[data-error]");
    if (line) line.textContent = message || "";
    item.classList.toggle("is-error", !!message);
    var control = item.querySelector("input, textarea");
    if (control) {
      if (message) control.setAttribute("aria-invalid", "true");
      else control.removeAttribute("aria-invalid");
    }
  }

  function sync(item) {
    item.classList.toggle("is-filled", filled(item));
    /* Whatever was wrong is no longer being asserted the moment it is touched. */
    explain(item, "");
  }

  items.forEach(function (item) {
    controls(item).forEach(function (el) {
      el.addEventListener("focus", function () {
        item.classList.add("is-active");
      });

      el.addEventListener("blur", function () {
        item.classList.remove("is-active");
        sync(item);
      });

      el.addEventListener("input", function () {
        sync(item);
      });

      el.addEventListener("change", function () {
        sync(item);
      });
    });

    /* A page restored from the back/forward cache keeps what was typed, so the
       boxes have to be told what they are already holding. */
    sync(item);
  });

  /* ============================ the upload ============================== */

  var MAX_BYTES = 2 * 1024 * 1024; // the 2mb the label promises

  var file = form.querySelector('input[type="file"]');
  var fileText = form.querySelector("[data-file-text]");

  if (file && fileText) {
    var idle = fileText.textContent;

    file.addEventListener("change", function () {
      var picked = file.files && file.files[0];

      if (!picked) {
        fileText.textContent = idle;
        return;
      }

      /* Refused here rather than at submit: the person is looking at the file
         picker's result right now, which is the moment it makes sense. */
      if (picked.size > MAX_BYTES) {
        file.value = "";
        fileText.textContent = "Too big - 2mb max";
        file.closest("[data-item]").classList.add("is-error");
        return;
      }

      fileText.textContent = picked.name;
    });
  }

  /* ========================== the entrance ============================== */

  /* The fields are held back until the loading screen has handed the page over,
     then fade in a beat later - the pause is the entrance. On an internal
     navigation there is no loading screen and the loader marks the page
     revealed straight away. */
  function ready() {
    root.classList.add("is-form-ready");
  }

  if (root.classList.contains("is-loaded")) ready();
  else document.addEventListener("site:revealed", ready, { once: true });

  /* The loader resolves itself even when assets fail, so this should never be
     what reveals the form. It is here so a missing or broken loader cannot
     leave the page permanently empty. */
  setTimeout(ready, 12000);

  /* ============================== sending =============================== */

  var note = form.querySelector("[data-note]");
  var submit = form.querySelector(".cform__submit");
  var label = form.querySelector("[data-submit-label]");
  var check = form.querySelector(".cform__check");
  /* The bot trap is a checkbox too, and must never be mistaken for this one. */
  var agree = form.querySelector('input[type="checkbox"]:not(.cform__trap)');

  var TIMEOUT = 15000; // give up on the service after this long, and say so
  var TOO_FAST = 3000; // no person fills the form in less, but a script does
  var openedAt = Date.now();
  var resetTimer = 0;

  /* The note beside the button, and what kind of thing it is saying - the
     stylesheet colours an error and a success differently. */
  function say(message, kind) {
    if (!note) return;
    note.textContent = message;
    note.dataset.kind = kind || "";
  }

  /* The button says where the send has got to: idle, sending, or sent. */
  function state(name) {
    submit.dataset.state = name;
    submit.disabled = name === "sending";
    if (label) label.textContent = name === "sending" ? "Sending" : name === "sent" ? "Sent ✓" : "Send";
  }

  /* What is wrong with one field, in the field's own words: empty, or (for
     the email) not the shape of an address. */
  function problemWith(item) {
    var bad = "";
    controls(item).some(function (el) {
      if (!el.required) return false;
      if (el.value.trim() === "") bad = el.getAttribute("data-missing") || "Please fill this in";
      /* checkValidity covers the email shape the browser knows. */
      else if (!el.checkValidity()) bad = el.getAttribute("data-malformed") || "Please check this";
      return !!bad;
    });
    return bad;
  }

  /* Every required control, checked in the order they are read, so the first
     thing reported is the first thing wrong on the page. */
  function invalid() {
    var bad = [];

    items.forEach(function (item) {
      var message = problemWith(item);
      explain(item, message);
      if (message) bad.push(item);
    });

    var unticked = agree && !agree.checked;
    if (check) check.classList.toggle("is-error", !!unticked);

    return { fields: bad, unticked: unticked };
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (submit.dataset.state === "sending") return;
    clearTimeout(resetTimer);
    state("idle");

    var problems = invalid();

    if (problems.fields.length) {
      say(problems.fields.length === 1 ? "One field needs a look" : "A few fields need a look", "error");
      var first = problems.fields[0].querySelector("input, textarea");
      if (first) first.focus();
      return;
    }

    if (problems.unticked) {
      say("Please agree to the privacy policy", "error");
      return;
    }

    /* Filled in faster than anyone types - almost certainly a script. Nothing
       is sent, and the form says so rather than pretending otherwise; a person
       who really was that quick just presses Send again. */
    if (Date.now() - openedAt < TOO_FAST) {
      say("That was quick - please check your message and press Send again", "error");
      openedAt = 0;
      return;
    }

    var endpoint = (form.getAttribute("data-endpoint") || "").trim();

    /* No endpoint means there is nowhere for this to go. Saying so is the only
       honest thing to do - a form that shows a thank-you and drops the message
       loses real enquiries without anyone noticing. */
    if (!endpoint) {
      say("This form is not connected yet - please email instead", "error");
      return;
    }

    state("sending");
    say("", "");

    var abort = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (abort) abort.abort(); }, TIMEOUT);

    fetch(endpoint, {
      method: "POST",
      headers: { Accept: "application/json" },
      body: new FormData(form),
      signal: abort ? abort.signal : undefined
    })
      .then(function (res) {
        /* Web3Forms answers in JSON; a 200 whose body says it failed is still
           a failure, and is reported as one. */
        return res.json().catch(function () { return {}; }).then(function (body) {
          if (!res.ok || body.success === false) throw new Error(body.message || res.status);
        });
      })
      .then(function () {
        form.reset();
        items.forEach(sync);
        state("sent");
        say("Thank you - your message is on its way. I will be in touch soon.", "success");
        /* The button goes back to Send after a while, ready for another. */
        resetTimer = setTimeout(function () { state("idle"); }, 4000);
      })
      .catch(function (err) {
        state("idle");
        var timedOut = err && err.name === "AbortError";
        say(timedOut
          ? "The connection is taking too long - please try again, or email instead"
          : "That did not send - please try again, or email instead", "error");
      })
      .then(function () {
        clearTimeout(timer);
      });
  });

  state("idle");
})();

(function () {
  'use strict';

  var track = document.querySelector('[data-track]');
  var projects = window.worksProjects;
  var mediaDelivery = window.worksMedia;
  if (!track || !projects || !projects.length) return;
  var stage = track.parentElement;

  // Both copies of the strip use stable IDs, never filenames or DOM positions.
  var template = track.querySelector('.panel');
  track.replaceChildren();
  // The orbit shows each project once; only an endless strip needs the copy.
  var sequence = track.closest('.works--orbit') ? projects : projects.concat(projects);
  sequence.forEach(function (project, index) {
    var panel = template.cloneNode(true);
    panel.style.setProperty('--i', index % projects.length);
    panel.dataset.project = project.id;
    panel.setAttribute('role', 'button');
    panel.setAttribute('aria-label', 'Open ' + project.name);
    panel.tabIndex = index < projects.length ? 0 : -1;
    panel.removeAttribute('aria-hidden');
    panel.querySelector('.panel__cap').textContent = project.name;
    var image = document.createElement('img');
    image.className = 'panel__img';
    image.dataset.src = project.thumbnail;
    mediaDelivery.configureImage(image, project.thumbnailSources, 'grid', project.thumbnailAvifSources);
    image.alt = '';
    // works.js assigns src only near the viewport. Native lazy loading adds a
    // second gate which can misclassify transformed panels as offscreen.
    image.decoding = 'async';
    image.addEventListener('load', function () { image.classList.add('is-loaded'); });
    image.addEventListener('error', function () {
      if (image.dataset.fallback) return;
      image.dataset.fallback = 'true';
      image.removeAttribute('srcset');
      clearPictureSource(image);
      image.src = project.poster;
    });
    panel.querySelector('.panel__frame').replaceChildren(pictureFor(image, project.thumbnailAvifSources));
    track.appendChild(panel);
  });
  window.dispatchEvent(new Event('works:images-ready'));

  var overlay = document.createElement('div');
  overlay.className = 'project-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'project-title');
  overlay.setAttribute('aria-hidden', 'true');
  overlay.innerHTML = '<article class="project"><header class="project__hero"><div class="project__hero-media"></div><div class="project__info"><div class="project__rule"><span class="project__word">CLIENT / AVISION LAB</span><span class="project__word">2026</span></div><h1 id="project-title"></h1><div class="project__credit"><span class="project__word">3D</span></div></div></header><section class="project__details" aria-label="Project media"></section></article><nav class="project__switch" aria-label="Project navigation"><button class="project__previous" type="button">PREVIOUS</button><button class="project__next" type="button">NEXT</button></nav><button class="project__close nav__link" type="button">BACK</button>';
  document.body.appendChild(overlay);
  var media = overlay.querySelector('.project__hero-media');
  var details = overlay.querySelector('.project__details');
  var info = overlay.querySelector('.project__info');
  var title = overlay.querySelector('h1');
  var back = overlay.querySelector('.project__close');
  var previous = overlay.querySelector('.project__previous');
  var next = overlay.querySelector('.project__next');
  var projectIndex = -1;
  var opener = null;
  var generation = 0;
  var cleanup = [];
  var videos = [];
  var background = [];
  var expansionTimer = 0;
  var closingAnimation = false;

  function pictureFor(image, sources) {
    var picture = document.createElement('picture');
    picture.className = 'media-picture';
    if (sources && sources.length) {
      var source = document.createElement('source');
      source.type = 'image/avif';
      picture.appendChild(source);
    }
    picture.appendChild(image);
    return picture;
  }

  function clearPictureSource(image) {
    var source = image.parentElement && image.parentElement.querySelector('source');
    if (source) {
      source.removeAttribute('srcset');
      source.removeAttribute('sizes');
    }
  }

  function dispose() {
    generation++;
    clearTimeout(expansionTimer);
    cleanup.forEach(function (fn) { fn(); });
    cleanup = [];
    videos.forEach(function (video) {
      video.pause();
      video.removeAttribute('src');
      video.load();
    });
    videos = [];
    media.replaceChildren();
    details.replaceChildren();
  }

  /* The tile to fly home to is the one for the project on screen now, not the
     one first clicked - previous/next may have moved on since. close() has the
     strip bring that tile into view first; the strip holds every project twice,
     so take the copy nearest the middle of the screen, and only one that is at
     least partly in view - should it still be off, close without the flight
     rather than send the frame off the edge. */
  function homeFor(project) {
    var best = null;
    var bestDistance = Infinity;
    var middle = window.innerWidth / 2;
    Array.prototype.forEach.call(track.querySelectorAll('.panel[data-project]'), function (panel) {
      if (panel.dataset.project !== project.id) return;
      var r = panel.getBoundingClientRect();
      if (r.right <= 0 || r.left >= window.innerWidth || r.bottom <= 0 || r.top >= window.innerHeight) return;
      var distance = Math.abs(r.left + r.width / 2 - middle);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = panel;
      }
    });
    return best;
  }

  function close() {
    if (projectIndex < 0 || overlay.classList.contains('is-closing')) return;
    window.dispatchEvent(new CustomEvent('works:reveal', { detail: { id: projects[projectIndex].id } }));
    var home = homeFor(projects[projectIndex]);
    if (home || (opener && opener.dataset.project !== projects[projectIndex].id)) opener = home;
    var frame = media.querySelector('.project-overlay__frame');
    var target = opener && opener.isConnected ? opener.querySelector('.panel__frame') : null;
    var targetBounds = target ? target.getBoundingClientRect() : null;
    var atFirstSection = overlay.scrollTop <= 1;
    var shouldAnimate = frame && targetBounds && atFirstSection &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var closingFrame = shouldAnimate ? frame.cloneNode(true) : null;
    var closingVideo = shouldAnimate ? frame.querySelector('.project-overlay__video') : null;
    if (closingFrame) {
      closingFrame.querySelectorAll('video, .project__media-status').forEach(function (element) { element.remove(); });
      if (closingVideo) {
        var videoIndex = videos.indexOf(closingVideo);
        if (videoIndex >= 0) videos.splice(videoIndex, 1);
        closingFrame.appendChild(closingVideo);
      }
      closingFrame.classList.remove('is-expanded');
      var frameBounds = frame.getBoundingClientRect();
      closingFrame.style.left = frameBounds.left + 'px';
      closingFrame.style.top = frameBounds.top + 'px';
      closingFrame.style.width = frameBounds.width + 'px';
      closingFrame.style.height = frameBounds.height + 'px';
      closingFrame.style.zIndex = '40';
      closingFrame.style.pointerEvents = 'none';
      closingAnimation = true;
      document.body.appendChild(closingFrame);
      closeImmediately();
      requestAnimationFrame(function () {
        closingFrame.style.left = targetBounds.left + 'px';
        closingFrame.style.top = targetBounds.top + 'px';
        closingFrame.style.width = targetBounds.width + 'px';
        closingFrame.style.height = targetBounds.height + 'px';
        setTimeout(function () {
          if (closingVideo) {
            closingVideo.pause();
            closingVideo.removeAttribute('src');
            closingVideo.load();
          }
          closingFrame.remove();
          closingAnimation = false;
        }, 1000);
      });
      return;
    }

    function finishClose() {
      if (!overlay.classList.contains('is-closing')) return;
      if (closingFrame) closingFrame.removeEventListener('transitionend', finishClose);
      if (closingFrame) closingFrame.remove();
      clearTimeout(expansionTimer);
      projectIndex = -1;
      overlay.classList.remove('is-open', 'is-settled', 'is-video-playing', 'is-closing');
      overlay.setAttribute('aria-hidden', 'true');
      document.documentElement.classList.remove('project-open');
      if (opener && opener.isConnected) opener.focus({ preventScroll: true });
    }

    overlay.classList.remove('is-video-playing', 'is-settled');
    overlay.classList.add('is-closing');
    dispose();
    if (closingFrame) media.appendChild(closingFrame);
    document.documentElement.classList.remove('project-open');
    background.forEach(function (entry) { entry.element.inert = entry.inert; });
    background = [];
    window.dispatchEvent(new Event('works:resume'));
    if (!shouldAnimate) {
      finishClose();
      return;
    }
    closingFrame.style.left = targetBounds.left + 'px';
    closingFrame.style.top = targetBounds.top + 'px';
    closingFrame.style.width = targetBounds.width + 'px';
    closingFrame.style.height = targetBounds.height + 'px';
    closingFrame.addEventListener('transitionend', finishClose);
    expansionTimer = setTimeout(finishClose, 1000);
  }

  function closeImmediately() {
    if (projectIndex < 0) return;
    dispose();
    projectIndex = -1;
    overlay.classList.remove('is-open', 'is-settled', 'is-video-playing', 'is-closing');
    overlay.setAttribute('aria-hidden', 'true');
    document.documentElement.classList.remove('project-open');
    background.forEach(function (entry) { entry.element.inert = entry.inert; });
    background = [];
    window.dispatchEvent(new Event('works:resume'));
    if (opener && opener.isConnected) opener.focus({ preventScroll: true });
  }

  function listen(element, event, handler) {
    element.addEventListener(event, handler);
    cleanup.push(function () { element.removeEventListener(event, handler); });
  }

  // Media errors are local to their tile. Opening never waits for a request.
  function videoTile(container, src, poster, isHero, token, hd, posterSources, loop) {
    var autoplay = isHero || !!loop;
    var video = document.createElement('video');
    video.className = isHero ? 'project-overlay__video' : 'project__video';
    video.playsInline = true;
    video.preload = 'none';
    video.controls = !autoplay;
    video.muted = autoplay;
    video.defaultMuted = autoplay;
    video.loop = autoplay;
    if (loop) video.dataset.loop = 'true';
    if (poster && !isHero) video.dataset.poster = poster;
    video.setAttribute('aria-label', isHero ? 'Project preview' : 'Play film');
    var status = document.createElement('div');
    status.className = 'project__media-status';
    var message = document.createElement('span');
    message.setAttribute('role', 'status');
    var retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = 'Play video';
    retry.hidden = true;
    status.append(message, retry);
    container.append(video, status);
    videos.push(video);
    // The poster goes on at once, not when the source is attached.
    //
    // A detail video carries preload="none" and is given its source only when
    // the observer says it has come into view. Until then the element has
    // nothing to paint and falls back to its CSS background, so the tile reads
    // as a flat charcoal rectangle - and it stays that way for as long as the
    // observer takes, which on a page this tall is most of the reader's visit.
    // Setting the poster here means the tile always holds a frame of the film.
    if (video.dataset.poster) {
      video.poster = mediaDelivery.posterSource(posterSources,
        container.clientWidth || window.innerWidth, video.dataset.poster);
    }
    var visible = isHero;
    var savedTime = 0;
    var selectedSource = null;
    var recoveryTimer = 0;
    var wantsPlayback = autoplay;
    var requestVersion = 0;
    cleanup.push(function () { clearTimeout(recoveryTimer); });

    function current() { return generation === token && video.isConnected; }
    function attach() {
      if (!current() || document.hidden || video.hasAttribute('src')) return;
      if (video.dataset.poster) video.poster = mediaDelivery.posterSource(posterSources, container.clientWidth, video.dataset.poster);
      video.preload = autoplay ? 'auto' : 'metadata';
      if (!selectedSource) selectedSource = hd && mediaDelivery.useHD() ? hd : src;
      requestVersion++;
      video.src = selectedSource;
      if (autoplay) armRecovery();
    }
    function downshift() {
      if (!current() || !visible || selectedSource !== hd) return false;
      clearTimeout(recoveryTimer);
      var resume = wantsPlayback && !document.hidden;
      release();
      selectedSource = src;
      attach();
      if (resume) play();
      return true;
    }
    function armRecovery() {
      if (selectedSource !== hd || recoveryTimer || !visible) return;
      recoveryTimer = setTimeout(function () {
        recoveryTimer = 0;
        downshift();
      }, 4000);
    }
    function play() {
      if (!current() || !visible || document.hidden) return;
      attach();
      wantsPlayback = true;
      message.textContent = 'Loading video…';
      retry.hidden = true;
      var attempt = requestVersion;
      var promise = video.play();
      if (promise) promise.catch(function (error) {
        if (!current() || attempt !== requestVersion || !visible || error.name === 'AbortError') return;
        clearTimeout(recoveryTimer);
        recoveryTimer = 0;
        if (error.name === 'NotAllowedError') wantsPlayback = false;
        message.textContent = video.error ? 'Video could not load.' : 'Tap to play.';
        retry.textContent = video.error ? 'Retry video' : 'Play video';
        retry.hidden = false;
      });
    }
    function release() {
      clearTimeout(recoveryTimer);
      recoveryTimer = 0;
      savedTime = video.currentTime || savedTime;
      requestVersion++;
      video.pause();
      video.classList.remove('is-ready');
      video.removeAttribute('src');
      video.load();
    }
    listen(video, 'loadedmetadata', function () {
      if (!current() || !savedTime) return;
      try { video.currentTime = Math.min(savedTime, Math.max(0, video.duration - 0.1)); } catch (e) {}
    });
    listen(video, 'playing', function () {
      if (!current()) return;
      // Keep the thumbnail until playback actually starts, including on iOS.
      video.classList.add('is-ready');
      if (isHero && !info.classList.contains('is-revealed')) {
        overlay.classList.add('is-video-playing');
        info.classList.add('is-revealed');
      }
      wantsPlayback = true;
      clearTimeout(recoveryTimer);
      recoveryTimer = 0;
      message.textContent = '';
      retry.hidden = true;
      // Starting a film stops the others, so two soundtracks can never run at
      // once. Silent ambient loops are the exception: they carry no audio to
      // clash and are meant to run together, so one never stops another.
      //
      // Read off the element rather than the closure, so that both sides of
      // the comparison are asking the same question of the same flag. Asking
      // the closure meant a caller that simply left the argument off - as the
      // hero's did - was treated as a film with sound, and every loop on the
      // page was stopped each time it began.
      var ambient = video.dataset.loop === 'true';
      videos.forEach(function (other) {
        if (other !== video && !(ambient && other.dataset.loop === 'true')) other.pause();
      });
    });
    listen(video, 'waiting', function () {
      if (current() && visible) {
        wantsPlayback = !video.paused;
        message.textContent = '';
        armRecovery();
      }
    });
    listen(video, 'pause', function () {
      if (!video.paused) return;
      wantsPlayback = false;
      clearTimeout(recoveryTimer);
      recoveryTimer = 0;
    });
    listen(video, 'error', function () {
      if (!current() || !video.hasAttribute('src') || !video.error) return;
      if (downshift()) return;
      video.classList.remove('is-ready');
      message.textContent = 'Video could not load.';
      retry.textContent = 'Retry video';
      retry.hidden = false;
    });
    listen(retry, 'click', function () { release(); play(); });
    listen(document, 'visibilitychange', function () {
      if (document.hidden) {
        if (video.hasAttribute('src')) release();
      } else if (visible) {
        attach();
        if (autoplay) play();
      }
    });
    if ('IntersectionObserver' in window) {
      var observer = new IntersectionObserver(function (entries) {
        if (!current()) return;
        entries.forEach(function (entry) {
          visible = entry.isIntersecting && entry.intersectionRatio >= (isHero ? 0.5 : 0.05);
          if (visible) {
            attach();
            if (autoplay && video.paused) play();
          } else if (video.hasAttribute('src')) release();
        });
      }, { root: overlay, threshold: isHero ? 0.5 : 0.05,
           // A detail tile is armed shortly before it arrives, so the film is
           // already running by the time it is under the reader rather than
           // starting from a cold fetch once it is. The stills either side of
           // it are fetched on the same margin. The hero needs none: it is
           // already on the screen when the project opens.
           rootMargin: isHero ? '0px' : '300px 0px' });
      observer.observe(container);
      cleanup.push(function () { observer.disconnect(); });
    } else if (!isHero) {
      retry.hidden = false;
      visible = true;
    }
    // Retain user activation from the tap. The small preview starts at zero.
    if (isHero) play();
    return video;
  }

  function renderDetails(project, token) {
    details.classList.toggle('project__details--pairs', project.detailLayout === 'pairs');
    var observer = 'IntersectionObserver' in window ? new IntersectionObserver(function (entries) {
      if (generation !== token) return;
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var image = entry.target;
        mediaDelivery.loadImage(image);
        observer.unobserve(image);
      });
    }, { root: overlay, rootMargin: '250px 0px' }) : null;
    if (observer) cleanup.push(function () { observer.disconnect(); });
    var columns = {};
    var orderedMedia = project.media.slice().sort(function (a, b) {
      var aWeight = (a.layout === 'full' ? 0 : a.layout === 'intro' ? 1 : 2);
      var bWeight = (b.layout === 'full' ? 0 : b.layout === 'intro' ? 1 : 2);
      return aWeight - bWeight;
    });

    function buildFigure(item, parent) {
      var figure = document.createElement('figure');
      figure.className = 'project__detail';
      if (item.layout === 'intro') figure.classList.add('project__detail--intro');
      if (item.layout === 'full') figure.classList.add('project__detail--full');
      var caption = document.createElement('figcaption');
      caption.textContent = item.label;
      parent.appendChild(figure);
      if (item.type === 'video') {
        var detailVideo = videoTile(figure, item.src, item.poster, false, token, item.hd, item.posterSources, item.loop);
        if (item.width && item.height) detailVideo.style.aspectRatio = item.width + ' / ' + item.height;
        /* A vertical video meets the height cap long before its column's
           width, so it narrows to its own shape there instead of showing
           black down both sides. */
        if (item.width && item.height && item.height > item.width) {
          detailVideo.style.maxWidth = 'calc(85vh * ' + (item.width / item.height).toFixed(4) + ')';
          detailVideo.style.marginInline = 'auto';
        }
      } else if (item.type === 'youtube') {
        var youtubeId = item.videoId || '';
        var youtubeVideoLink = item.link || item.url || item.src || '';
        if (!youtubeId && youtubeVideoLink) {
          var match = youtubeVideoLink.match(/[?&]v=([^&#]+)/) || youtubeVideoLink.match(/youtu\.be\/([^?#]+)/);
          if (match) youtubeId = match[1];
        }
        var youtubeEmbed = youtubeVideoLink && youtubeVideoLink.indexOf('youtube.com/embed/') >= 0 ? youtubeVideoLink :
          'https://www.youtube.com/embed/' + encodeURIComponent(youtubeId) + '?autoplay=1&rel=0&playsinline=1';
        var youtubeLink = document.createElement('button');
        youtubeLink.type = 'button';
        youtubeLink.className = 'project__detail-link project__youtube-cover';
        youtubeLink.setAttribute('aria-label', item.label || 'Play YouTube video');
        var youtubeImage = document.createElement('img');
        youtubeImage.alt = item.label || 'YouTube preview';
        youtubeImage.width = item.width || 1280;
        youtubeImage.height = item.height || 720;
        youtubeImage.decoding = 'async';
        youtubeImage.dataset.src = item.poster;
        mediaDelivery.configureImage(youtubeImage, item.posterSources, 'detail', item.avifSources || []);
        var youtubePoster = pictureFor(youtubeImage, item.avifSources || item.posterSources);
        youtubeLink.appendChild(youtubePoster);
        if (observer) observer.observe(youtubeImage);
        else { youtubeImage.loading = 'lazy'; mediaDelivery.loadImage(youtubeImage); }
        var youtubePlayer = document.createElement('iframe');
        youtubePlayer.title = item.label || 'YouTube video';
        youtubePlayer.loading = 'lazy';
        youtubePlayer.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen';
        youtubePlayer.referrerPolicy = 'strict-origin-when-cross-origin';
        youtubePlayer.allowFullscreen = true;
        listen(youtubeLink, 'click', function (event) {
          event.preventDefault();
          if (youtubeLink.classList.contains('is-playing')) return;
          youtubeLink.classList.add('is-playing');
          youtubeLink.textContent = '';
          youtubeLink.appendChild(youtubePlayer);
          youtubePlayer.src = youtubeEmbed;
        });
        figure.appendChild(youtubeLink);
      } else {
        var image = document.createElement('img');
        image.alt = item.label;
        image.width = item.width;
        image.height = item.height;
        image.decoding = 'async';
        image.dataset.src = item.src;
        mediaDelivery.configureImage(image, item.sources, 'detail', item.avifSources);
        var retry = document.createElement('button');
        retry.className = 'project__image-retry';
        retry.type = 'button';
        retry.textContent = 'Retry image';
        retry.hidden = true;
        listen(image, 'error', function () { retry.hidden = false; });
        listen(image, 'load', function () { retry.hidden = true; });
        listen(retry, 'click', function () {
          image.removeAttribute('src');
          image.removeAttribute('srcset');
          clearPictureSource(image);
          mediaDelivery.loadImage(image);
        });
        figure.append(pictureFor(image, item.avifSources), retry);
        if (observer) observer.observe(image);
        else { image.loading = 'lazy'; mediaDelivery.loadImage(image); }
      }
      figure.appendChild(caption);
    }

    var topItems = [];
    var columnItems = [];
    var bottomItems = [];
    orderedMedia.forEach(function (item) {
      var isBottomHorizontalVideo = project.id === 'jordan' &&
        item.src && item.src.indexOf('okda-07') >= 0 &&
        item.type === 'video';
      if (isBottomHorizontalVideo) {
        bottomItems.push(item);
      } else if (item.layout === 'full' || item.layout === 'intro' || item.column === undefined || item.column === null) {
        topItems.push(item);
      } else {
        columnItems.push(item);
      }
    });

    topItems.forEach(function (item) {
      var parent = details;
      if (item.column === 'left' || item.column === 'right') parent = columns[item.column] || details;
      buildFigure(item, parent);
    });

    if (project.detailLayout === 'pairs') {
      ['left', 'right'].forEach(function (columnName) {
        var column = document.createElement('div');
        column.className = 'project__detail-column project__detail-column--' + columnName;
        details.appendChild(column);
        columns[columnName] = column;
      });
    }

    columnItems.forEach(function (item) {
      var parent = columns[item.column] || details;
      buildFigure(item, parent);
    });

    bottomItems.forEach(function (item) {
      buildFigure(item, details);
    });
  }

  function open(index, panel) {
    if (index < 0 || index >= projects.length) return;
    var navigating = projectIndex >= 0;
    var bounds = panel ? panel.querySelector('.panel__frame').getBoundingClientRect() : null;
    if (!navigating) {
      opener = panel;
      background = Array.prototype.map.call(document.querySelectorAll('main, .herolinks'), function (element) {
        var entry = { element: element, inert: element.inert };
        element.inert = true;
        return entry;
      });
    }
    dispose();
    var token = generation;
    projectIndex = index;
    var project = projects[index];
    overlay.dataset.project = project.id;
    title.textContent = project.name;
    var rule = info.querySelector('.project__rule');
    var credit = info.querySelector('.project__credit');
    /* Built as elements with their text set as text, never spliced into HTML:
       whatever a project's client or role says, it can only ever be words. */
    function word(text) {
      var span = document.createElement('span');
      span.className = 'project__word';
      span.textContent = text;
      return span;
    }
    if (rule) {
      var clientText = project.client ? 'CLIENT / ' + project.client : 'CLIENT / AVISION LAB';
      rule.replaceChildren(word(clientText), word('2026'));
    }
    if (credit) {
      credit.replaceChildren(word(project.role || '3D'));
    }
    previous.textContent = '‹ ' + projects[(index - 1 + projects.length) % projects.length].name;
    next.textContent = projects[(index + 1) % projects.length].name + ' ›';
    document.documentElement.classList.add('project-open');
    window.dispatchEvent(new Event('works:pause'));
    overlay.classList.remove('is-settled');
    overlay.classList.remove('is-video-playing');
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    overlay.scrollTop = 0;
    info.classList.remove('is-revealed');
    title.replaceChildren();
    var titleWord = document.createElement('span');
    titleWord.className = 'project__word';
    titleWord.textContent = project.name;
    title.appendChild(titleWord);
    Array.prototype.forEach.call(info.querySelectorAll('.project__word'), function (wordElement, wordIndex) {
      wordElement.style.setProperty('--word-delay', (wordIndex * 0.08) + 's');
    });
    var frame = document.createElement('div');
    frame.className = 'project-overlay__frame';
    if (bounds) {
      frame.style.left = bounds.left + 'px';
      frame.style.top = bounds.top + 'px';
      frame.style.width = bounds.width + 'px';
      frame.style.height = bounds.height + 'px';
    }
    var image = document.createElement('img');
    image.className = 'panel__img';
    image.alt = '';
    var gridImage = panel && panel.querySelector('.panel__img');
    image.src = gridImage && gridImage.currentSrc ? gridImage.currentSrc : project.thumbnail;
    image.dataset.src = project.poster;
    image.fetchPriority = 'low';
    mediaDelivery.configureImage(image, project.posterSources, 'hero', project.posterAvifSources);
    listen(image, 'error', function () {
      if (generation !== token || image.dataset.fallback) return;
      image.dataset.fallback = 'true';
      image.removeAttribute('srcset');
      clearPictureSource(image);
      image.src = project.poster;
    });
    frame.appendChild(pictureFor(image, project.posterAvifSources));
    media.appendChild(frame);
    // The hero is a silent looping preview, the same kind of clip as the
    // ambient tiles below it, and says so - otherwise it reads as a film with
    // a soundtrack and stops every loop on the page whenever it starts.
    var heroVideo = videoTile(frame, project.preview, null, true, token,
      project.previewHD, project.posterSources, true);
    renderDetails(project, token);
    function settled(event) {
      if (generation !== token || (event && (event.target !== frame || event.propertyName !== 'width'))) return;
      clearTimeout(expansionTimer);
      overlay.classList.add('is-settled');
      // Upgrade the still only if it is still visible. A hidden desktop poster
      // should never compete with a hero video which already started playing.
      if (!heroVideo.classList.contains('is-ready')) mediaDelivery.loadImage(image);
    }
    listen(frame, 'transitionend', settled);
    frame.getBoundingClientRect();
    requestAnimationFrame(function () {
      if (generation !== token) return;
      frame.classList.add('is-expanded');
      if (navigating || window.matchMedia('(prefers-reduced-motion: reduce)').matches) settled();
    });
    expansionTimer = setTimeout(settled, 1100);
    back.focus({ preventScroll: true });
  }

  function activate(event) {
    if (closingAnimation) return;
    var panel = event.target.closest('.panel[data-project]');
    if (!panel || !track.contains(panel)) return;
    var index = projects.findIndex(function (project) { return project.id === panel.dataset.project; });
    open(index, panel);
  }
  stage.addEventListener('click', activate);
  track.addEventListener('keydown', function (event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    activate(event);
  });
  back.addEventListener('click', close);
  previous.addEventListener('click', function () { open((projectIndex - 1 + projects.length) % projects.length); });
  next.addEventListener('click', function () { open((projectIndex + 1) % projects.length); });
  document.addEventListener('keydown', function (event) {
    if (projectIndex < 0) return;
    if (event.key === 'Escape') close();
    if (event.key !== 'Tab') return;
    var focusable = Array.prototype.filter.call(overlay.querySelectorAll('button, video[controls]'), function (element) {
      return !element.hidden && element.getClientRects().length;
    });
    var first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  window.addEventListener('pagehide', closeImmediately);
})();

(function () {
  'use strict';

  function connection() { return navigator.connection || navigator.mozConnection || navigator.webkitConnection; }
  function constrained() {
    var net = connection();
    return !!(net && (net.saveData || (net.effectiveType && net.effectiveType !== '4g') ||
      (net.downlink > 0 && net.downlink < 2)));
  }

  var measuredAt = -Infinity;
  var measuredBandwidth = 0;
  function bandwidth() {
    var net = connection();
    if (net && net.downlink > 0) return net.downlink;
    if (performance.now() - measuredAt < 1500) return measuredBandwidth;
    measuredAt = performance.now();
    // Safari does not expose Network Information. Use completed same-origin
    // media transfers, without latency or cached/zero-byte responses. Unknown
    // bandwidth keeps the small video; no probe request is ever made.
    var samples = performance.getEntriesByType('resource').filter(function (entry) {
      return /\/(pics|media)\/works\//.test(entry.name) && entry.transferSize > 0 &&
        entry.encodedBodySize > 8000 && entry.responseEnd > entry.responseStart;
    }).slice(-6);
    var bytes = 0, time = 0;
    samples.forEach(function (entry) {
      bytes += entry.encodedBodySize;
      time += entry.responseEnd - entry.responseStart;
    });
    measuredBandwidth = time ? bytes * 8 / time / 1000 : 0;
    return measuredBandwidth;
  }

  /* Every screen, phones included, gets HD unless the browser reports data
     saving or a slow line; unknown speed (Firefox, Safari) gets HD too. A
     measured slow line still keeps the small film. If HD does not start within
     four seconds the player drops to the small film on its own (project.js). */
  function useHD() {
    if (constrained()) return false;
    var measured = bandwidth();
    return !(measured > 0 && measured < 3);
  }

  function configureImage(image, sources, kind, avifSources) {
    image.worksSources = sources || [];
    image.worksAvifSources = avifSources || [];
    image.dataset.imageKind = kind;
  }

  function desiredWidth(image) {
    var sources = image.worksSources;
    var kind = image.dataset.imageKind;
    var ratio = sources.length ? sources[0].width / sources[0].height : 1;
    var pixelRatio = window.devicePixelRatio || 1;
    var limited = constrained();
    var density = Math.min(pixelRatio, limited ? 1 : 1.5);
    var width;
    if (kind === 'grid') {
      // Tall rectangles crop the sides, so sizing only by their narrow width
      // produces visibly soft images. Budget for the covered height as well.
      var frame = image.closest('.panel__frame') || image.parentElement;
      width = Math.max(frame.clientWidth, frame.clientHeight * ratio);
      return Math.min(limited ? 480 : 960, width * density);
    }
    if (kind === 'hero') {
      width = Math.max(window.innerWidth, window.innerHeight * ratio);
      return Math.min(limited ? 960 : 1920, width * density);
    }
    return Math.min(limited ? 800 : 2400, image.clientWidth * density);
  }

  function loadImage(image) {
    if (!image || !image.dataset.src || image.dataset.fallback) return;
    var sources = image.worksSources || [];
    var avifSources = image.worksAvifSources || [];
    if (sources.length) {
      // Account for the device DPR once. The capped slot keeps a 3x phone from
      // fetching a desktop-sized image for a small detail or grid thumbnail.
      image.sizes = Math.ceil(desiredWidth(image) / (window.devicePixelRatio || 1)) + 'px';
    }
    var pictureSource = image.parentElement && image.parentElement.querySelector('source[type="image/avif"]');
    if (pictureSource && avifSources.length) {
      pictureSource.sizes = image.sizes;
      pictureSource.srcset = avifSources.map(function (source) { return source.src + ' ' + source.width + 'w'; }).join(', ');
    }
    if (sources.length) image.srcset = sources.map(function (source) { return source.src + ' ' + source.width + 'w'; }).join(', ');
    image.src = image.dataset.src;
  }

  function posterSource(sources, width, fallback) {
    if (!sources || !sources.length) return fallback;
    var target = Math.min(constrained() ? 640 : 1920,
      width * Math.min(window.devicePixelRatio || 1, constrained() ? 1 : 1.5));
    var choice = sources.find(function (source) { return source.width >= target; });
    return (choice || sources[sources.length - 1]).src;
  }

  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      document.querySelectorAll('img[data-image-kind][srcset]').forEach(function (image) {
        var rect = image.getBoundingClientRect();
        if (rect.right >= 0 && rect.left <= window.innerWidth && rect.bottom >= 0 && rect.top <= window.innerHeight) loadImage(image);
      });
    }, 200);
  });

  window.worksMedia = { configureImage: configureImage, loadImage: loadImage,
    useHD: useHD, posterSource: posterSource };
})();

(function () {
  'use strict';
  window.siteMedia = {
    /* Every screen gets the HD film - phones included, since their sharp
       screens show a 960-pixel film as soft - unless the browser says it is
       saving data or on a slow line. Not knowing the speed (Firefox, Safari)
       is not a reason to go small. If HD is slow to arrive, the page drops to
       the small film itself (screenvideo.js). */
    slow: function () {
      var net = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      return !!(net && (net.saveData ||
        (net.effectiveType && net.effectiveType !== '4g') ||
        (net.downlink > 0 && net.downlink < 2)));
    },
    small: function (source) {
      return source.replace('.web.mp4', '.small.mp4');
    },
    videoSource: function (source) {
      return this.slow() ? this.small(source) : source;
    }
  };
})();

/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
// Look for a native version of requestAnimationFrame, or deal with the situation.
// We export the actual functions we use so that they can be overridden.
(function() {
  let actualCAF, actualRAF;
  if (typeof window !== 'undefined' && window !== null) {
    if ((actualRAF = window.requestAnimationFrame)) {
      actualCAF = window.cancelAnimationFrame ||
                  window.cancelRequestAnimationFrame;

    } else {
      // Look for a prefixed version.
      for (var prefix of ['moz', 'webkit', 'ms', 'o']) {
        if (actualRAF = window[`${prefix}RequestAnimationFrame`]) {
          actualCAF = window[`${prefix}CancelAnimationFrame`] ||
                      window[`${prefix}CancelRequestAnimationFrame`];
          break;
        }
      }
    }

    // Browsers don't like it when these are called on anything other than window.
    if (actualRAF) {
      actualRAF = actualRAF.bind(window);
      if (actualCAF) { actualCAF = actualCAF.bind(window); }
    }

    // Emulate by calling back immediately. No handle is returned.
    if (!actualRAF) {
      actualRAF = function(callback) {
        callback();
        return null;
      };

      actualCAF = timeout => null;
    }

  } else {
    // Assume Node.js.
    actualRAF = process.nextTick;
    actualCAF = null;
  }

  // If the request is not cancellable, deal with it by adding some state.
  if (!actualCAF) {
    exports.requestAnimationFrame = function(callback) {
      const state = {active: true};
      actualRAF(function() { if (state.active) { return callback(); } });
      return state;
    };

    return exports.cancelAnimationFrame = state => state.active = false;

  } else {
    exports.requestAnimationFrame = actualRAF;
    return exports.cancelAnimationFrame = actualCAF;
  }
})();


// Create a loop. Only takes options, and returns a handle object
// with `start` and `stop` methods. The options are:
//
//  - `rate`: tick rate in milliseconds between ticks.
//  - `tick`: function called for each simulation tick.
//  - `idle`: function called between tick processing, (not necessarily on every tick.)
//  - `frame`: function called when we are ready to draw a frame.
//
exports.createLoop = function(options) {
  let frameReq, timerReq;
  if (options == null) { options = {}; }
  let lastTick = (timerReq = (frameReq = null));

  // `setTimeout` callback.
  var timerCallback = function() {
    timerReq = null;

    // Simulate remaining ticks. We run ticks at a fixed rate, regardless of the actual timer
    // rate. We also allow for adjustments in rate, even between ticks inside this callback,
    // hence we always reference `options`.
    const now = Date.now();
    while ((now - lastTick) >= options.rate) {
      options.tick();
      lastTick += options.rate;
    }
    if (typeof options.idle === 'function') {
      options.idle();
    }

    // Schedule a frame, but only if we have a frame callback.
    if (options.frame && !frameReq) {
      frameReq = exports.requestAnimationFrame(frameCallback);
    }

    // Schedule next run. Use `setTimeout` so that the tick rate may be adjusted at runtime. Also
    // has the advantage of stopping the loop when things go awry.
    return timerReq = setTimeout(timerCallback, options.rate);
  };

  // `requestAnimationFrame` callback.
  var frameCallback = function() {
    frameReq = null;

    return options.frame();
  };

  // Handle and interface.
  const handle = {
    start() {
      if (!timerReq) {
        lastTick = Date.now();
        return timerReq = setTimeout(timerCallback, options.rate);
      }
    },

    stop() {
      if (timerReq) {
        clearInterval(timerReq);
        timerReq = null;
      }

      if (frameReq) {
        exports.cancelAnimationFrame(frameReq);
        return frameReq = null;
      }
    }
  };

  return handle;
};

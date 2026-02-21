/*
 * decaffeinate suggestions:
 * DS002: Fix invalid constructor
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
const {EventEmitter} = require('events');


//# Progress tracking

// A generic progress tracking mechanism. Typical usage is as follows:
//
//  * Add a number of tasks using calls to `add`.
//  * Install listeners for `progress` and `complete`.
//  * Call `wrapUp` to signal all tasks have been started.
//  * Wait for the `complete` signal, and continue as normal.
//
// Typically, you specify an amount of tasks that are running, but it could just as well be a
// remaining byte count or a percentage. The `amount` parameters are arbitrary numbers.
//
// An instance of `Progress` implements the `ProgressEvent` interface in the Progress Events
// specification published by W3C. The `Progress` object itself is passed on `progress` events,
// thus it should work for any loose implementation of a progress events consumer.

class Progress extends EventEmitter {

  constructor(initialAmount) {
    super(...arguments);
    this.lengthComputable = true;
    this.loaded = 0;
    this.total = (initialAmount != null) ? initialAmount : 0;
    this.wrappingUp = false;
  }

  // Add the given amount to the total. `amount` is optional, and defaults to 1. The return value is
  // a function that is a shortcut for `step(amount)`, and can be used as a callback for an event
  // listener. If given, the returned function will call `cb` as well, allowing for chaining.
  add(...args) {
    let amount, cb;
    if (typeof args[0] === 'number') {   amount = args.shift(); } else { amount = 1; }
    if (typeof args[0] === 'function') { cb     = args.shift(); } else { cb = null; }
    this.total += amount;
    this.emit('progress', this);
    return () => {
      this.step(amount);
      return (typeof cb === 'function' ? cb() : undefined);
    };
  }

  // Mark the given amount as loaded. `amount` is optional, and defaults to 1.
  step(amount) {
    if (amount == null) { amount = 1; }
    this.loaded += amount;
    this.emit('progress', this);
    return this.checkComplete();
  }

  // Reset the both `total` and `loaded` counters.
  set(total, loaded) {
    this.total = total;
    this.loaded = loaded;
    this.emit('progress', this);
    return this.checkComplete();
  }

  // Signal that all tasks are running, and no further `add` calls will be made. From this point on,
  // a `complete` event may be emitted. (Note: it may also be emitted from *within* this method.)
  wrapUp() {
    this.wrappingUp = true;
    return this.checkComplete();
  }

  // An internal helper that emits the 'complete' signal when appropriate.
  checkComplete() {
    if (!this.wrappingUp || !(this.loaded >= this.total)) { return; }
    return this.emit('complete');
  }
}


//# Exports

module.exports = Progress;

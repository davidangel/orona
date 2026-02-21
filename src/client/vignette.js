/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
class Vignette {

  constructor() {
    this.container = $('<div class="vignette"/>').appendTo('body');
    this.messageLine = $('<div class="vignette-message"/>').appendTo(this.container);
  }

  message(text) {
    return this.messageLine.text(text);
  }

  showProgress() {}
    // FIXME

  hideProgress() {}
    // FIXME

  progress(p) {}
    // FIXME

  destroy() {
    this.container.remove();
    return this.container = (this.messageLine = null);
  }
}


//# Exports
module.exports = Vignette;

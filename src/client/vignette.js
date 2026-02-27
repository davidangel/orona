/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
const $ = require('../dom');

class Vignette {

  constructor() {
    this.container = document.createElement('div');
    this.container.className = 'vignette';
    document.body.appendChild(this.container);
    this.messageLine = document.createElement('div');
    this.messageLine.className = 'vignette-message';
    this.container.appendChild(this.messageLine);
  }

  message(text) {
    return this.messageLine.textContent = text;
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

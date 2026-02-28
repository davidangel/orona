/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS202: Simplify dynamic range loops
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
const { createLoop }   = require('villain/loop');
const Progress         = require('../progress');
const Vignette         = require('../vignette');
const SoundKit         = require('../soundkit');
const DefaultRenderer  = require('../renderer/offscreen_2d');
const {TICK_LENGTH_MS} = require('../../constants');
const helpers          = require('../../helpers');
const BoloWorldMixin   = require('../../world_mixin');
const $                = require('../../dom');


//# Client world mixin

// Common logic between `BoloLocalWorld` and `BoloClientWorld`

const BoloClientWorldMixin = {

  start() {
    const vignette = new Vignette();
    return this.waitForCache(vignette, () => {
      return this.loadResources(vignette, () => {
        return this.loaded(vignette);
      });
    });
  },

  // Wait for the applicationCache to finish downloading.
  waitForCache(vignette, callback) {
    // FIXME: Use applicationCache again.
    return callback();
  },

  // Loads all required resources.
  loadResources(vignette, callback) {
    vignette.message('Loading resources');
    const progress = new Progress();

    this.images = {};
    this.loadImages(name => {
      let img;
      this.images[name] = (img = new Image());
      img.onload = progress.add();
      return img.src = `images/${name}.png`;
    });

    this.soundkit = new SoundKit();
    this.loadSounds(name => {
      const src = `sounds/${name}.ogg`;
      const parts = name.split('_');
      for (let i = 1, end = parts.length, asc = 1 <= end; asc ? i < end : i > end; asc ? i++ : i--) {
        parts[i] = parts[i].substr(0, 1).toUpperCase() + parts[i].substr(1);
      }
      const methodName = parts.join('');
      return this.soundkit.load(methodName, src, progress.add());
    });

    if (typeof applicationCache === 'undefined' || applicationCache === null) {
      vignette.showProgress();
      progress.on('progress', p => vignette.progress(p));
    }
    progress.on('complete', function() {
      vignette.hideProgress();
      return callback();
    });
    return progress.wrapUp();
  },

  loadImages(i) {
    i('base');
    i('styled');
    return i('overlay');
  },

  loadSounds(s) {
    s('big_explosion_far');
    s('big_explosion_near');
    s('bubbles');
    s('farming_tree_far');
    s('farming_tree_near');
    s('hit_tank_far');
    s('hit_tank_near');
    s('hit_tank_self');
    s('man_building_far');
    s('man_building_near');
    s('man_dying_far');
    s('man_dying_near');
    s('man_lay_mine_near');
    s('mine_explosion_far');
    s('mine_explosion_near');
    s('shooting_far');
    s('shooting_near');
    s('shooting_self');
    s('shot_building_far');
    s('shot_building_near');
    s('shot_tree_far');
    s('shot_tree_near');
    s('tank_sinking_far');
    return s('tank_sinking_near');
  },

  // Common initialization once the map is available.
  commonInitialization() {
    this.renderer = new DefaultRenderer(this);

    this.map.world = this;
    this.map.setView(this.renderer);

    this.boloInit();

    this.loop = createLoop({
      rate: TICK_LENGTH_MS,
      tick: () => this.tick(),
      frame: () => this.renderer.draw()
    });

    this.increasingRange = false;
    this.decreasingRange = false;
    this.rangeAdjustTimer = 0;

    this.input = $.create('input', { id: 'input-dummy', type: 'text', autocomplete: 'off' });
    this.renderer.canvas.parentNode.insertBefore(this.input, this.renderer.canvas);
    this.input.focus();

    this.input.addEventListener('keydown', e => {
      e.preventDefault();
      switch (e.which) {
          case 90: return this.increasingRange = true;
          case 88: return this.decreasingRange = true;
          default: return this.handleKeydown(e);
        }
    });
    this.input.addEventListener('keyup', e => {
        e.preventDefault();
        switch (e.which) {
          case 90: return this.increasingRange = false;
          case 88: return this.decreasingRange = false;
          default: return this.handleKeyup(e);
        }
    });
  },

  // Method called when things go awry.
  failure(message) {
    if (this.loop != null) {
      this.loop.stop();
    }
    const overlay = $.create('div', { class: 'fixed inset-0 bg-black/70 z-50 flex items-center justify-center' });
    const dialog = document.createElement('div');
    dialog.className = 'bg-gray-800 rounded-lg shadow-2xl p-6 min-w-[300px] max-w-md border border-gray-700';
    let extraLink = '';
    if (message === 'Connection lost') {
      extraLink = '<a href="/" class="block mt-4 text-center text-blue-400 hover:text-blue-300 text-sm">Create a new game</a>';
    }
    dialog.innerHTML = `
      <p class="text-gray-300 mb-4">${message}</p>
      <button class="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium transition-colors">OK</button>
      ${extraLink}
    `;
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    dialog.querySelector('button').addEventListener('click', () => overlay.remove());
  },

  // Check and rewrite the build order that the user just tried to do.
  checkBuildOrder(action, cell) {
    // FIXME: queue actions
    let flexible, trees;
    const builder = this.player.builder.$;
    if (builder.order !== builder.states.inTank) { return [false]; }

    // FIXME: These should notify the user why they failed.
    if (cell.mine) { return [false]; }
    [action, trees, flexible] = Array.from((() => { switch (action) {
      case 'forest':
        if (cell.base || cell.pill || !cell.isType('#')) { return [false];
        } else { return ['forest', 0]; }
      case 'road':
        if (cell.base || cell.pill || cell.isType('|', '}', 'b', '^')) { return [false];
        } else if (cell.isType('#')) { return ['forest', 0];
        } else if (cell.isType('=')) { return [false];
        } else if (cell.isType(' ') && cell.hasTankOnBoat()) { return [false];
        } else { return ['road', 2]; }
      case 'building':
        if (cell.base || cell.pill || cell.isType('b', '^')) { return [false];
        } else if (cell.isType('#')) { return ['forest', 0];
        } else if (cell.isType('}')) { return ['repair', 1];
        } else if (cell.isType('|')) { return [false];
        } else if (cell.isType(' ')) {
          if (cell.hasTankOnBoat()) { return [false];
          } else { return ['boat', 20]; }
        } else if (cell === this.player.cell) { return [false];
        } else { return ['building', 2]; }
      case 'pillbox':
        if (cell.pill) {
          if (cell.pill.armour === 16) { return [false];
          } else if (cell.pill.armour >= 11) { return ['repair', 1, true];
          } else if (cell.pill.armour >=  7) { return ['repair', 2, true];
          } else if (cell.pill.armour >=  3) { return ['repair', 3, true];
          } else if (cell.pill.armour  <  3) { return ['repair', 4, true]; }
        } else if (cell.isType('#')) { return ['forest', 0];
        } else if (cell.base || cell.isType('b', '^', '|', '}', ' ')) { return [false];
        } else if (cell === this.player.cell) { return [false];
        } else { return ['pillbox', 4]; }
        break;
      case 'mine':
        if (cell.base || cell.pill || cell.isType('^', ' ', '|', 'b', '}')) { return [false];
        } else { return ['mine']; }
    } })());

    if (!action) { return [false]; }
    if (action === 'mine') {
      if (this.player.mines === 0) { return [false]; }
      return ['mine'];
    }
    if (action === 'pill') {
      const pills = this.player.getCarryingPillboxes();
      if (pills.length === 0) { return [false]; }
    }
    if (this.player.trees < trees) {
      if (!flexible) { return [false]; }
      ({
        trees
      } = this.player);
    }
    return [action, trees, flexible];
  }
};

helpers.extend(BoloClientWorldMixin, BoloWorldMixin);


//# Exports
module.exports = BoloClientWorldMixin;

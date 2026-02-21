/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS206: Consider reworking classes to avoid initClass
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
const NetLocalWorld    = require('villain/world/net/local');
const WorldMap         = require('../../world_map');
const EverardIsland    = require('../everard');
const allObjects       = require('../../objects/all');
const Tank             = require('../../objects/tank');
const {decodeBase64}   = require('../base64');
const helpers          = require('../../helpers');

// FIXME: Better error handling all around.


//# Local game

// The `BoloLocalWorld` class implements a game local to the player's computer/browser.

class BoloLocalWorld extends NetLocalWorld {
  static initClass() {
  
    this.prototype.authority = true;
  }

  // Callback after resources have been loaded.
  loaded(vignette) {
    this.map = WorldMap.load(decodeBase64(EverardIsland));
    this.commonInitialization();
    this.spawnMapObjects();
    this.player = this.spawn(Tank, 0);
    this.renderer.initHud();
    vignette.destroy();
    return this.loop.start();
  }

  tick() {
    super.tick(...arguments);

    if (this.increasingRange !== this.decreasingRange) {
      if (++this.rangeAdjustTimer === 6) {
        if (this.increasingRange) { this.player.increaseRange();
        } else { this.player.decreaseRange(); }
        return this.rangeAdjustTimer = 0;
      }
    } else {
      return this.rangeAdjustTimer = 0;
    }
  }

  soundEffect(sfx, x, y, owner) {
    return this.renderer.playSound(sfx, x, y, owner);
  }

  mapChanged(cell, oldType, hadMine, oldLife) {}

  //### Input handlers.

  handleKeydown(e) {
    switch (e.which) {
      case 32: return this.player.shooting = true;
      case 37: return this.player.turningCounterClockwise = true;
      case 38: return this.player.accelerating = true;
      case 39: return this.player.turningClockwise = true;
      case 40: return this.player.braking = true;
    }
  }

  handleKeyup(e) {
    switch (e.which) {
      case 32: return this.player.shooting = false;
      case 37: return this.player.turningCounterClockwise = false;
      case 38: return this.player.accelerating = false;
      case 39: return this.player.turningClockwise = false;
      case 40: return this.player.braking = false;
    }
  }

  buildOrder(action, trees, cell) {
    return this.player.builder.$.performOrder(action, trees, cell);
  }
}
BoloLocalWorld.initClass();

helpers.extend(BoloLocalWorld.prototype, require('./mixin'));
allObjects.registerWithWorld(BoloLocalWorld.prototype);


//# Exports
module.exports = BoloLocalWorld;

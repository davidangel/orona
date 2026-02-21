/*
 * decaffeinate suggestions:
 * DS002: Fix invalid constructor
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
// The pillbox is a map object, and thus a slightly special case of world object.

const {min, max, round, ceil, PI, cos, sin} = Math;
const {TILE_SIZE_WORLD} = require('../constants');
const {distance, heading} = require('../helpers');
const BoloObject = require('../object');
const sounds     = require('../sounds');
const Shell      = require('./shell');


class WorldPillbox extends BoloObject {

  // This is a MapObject; it is constructed differently on the server.
  constructor(world_or_map, x, y, owner_idx, armour, speed) {
    super(...arguments);
    this.owner_idx = owner_idx;
    this.armour = armour;
    this.speed = speed;
    if (arguments.length === 1) {
      this.world = world_or_map;
    } else {
      this.x = (x + 0.5) * TILE_SIZE_WORLD; this.y = (y + 0.5) * TILE_SIZE_WORLD;
    }

    // Keep track of owner and position changes.
    this.on('netUpdate', changes => {
      if (changes.hasOwnProperty('x') || changes.hasOwnProperty('y')) {
        this.updateCell();
      }
      if (changes.hasOwnProperty('inTank') || changes.hasOwnProperty('carried')) {
        this.updateCell();
      }
      if (changes.hasOwnProperty('owner')) {
        this.updateOwner();
      }
      if (changes.hasOwnProperty('armour')) {
        return (this.cell != null ? this.cell.retile() : undefined);
      }
    });
  }

  // Helper that updates the cell reference, and ensures a back-reference as well.
  updateCell() {
    if (this.cell != null) {
      delete this.cell.pill;
      this.cell.retile();
    }
    if (this.inTank || this.carried) {
      return this.cell = null;
    } else {
      this.cell = this.world.map.cellAtWorld(this.x, this.y);
      this.cell.pill = this;
      return this.cell.retile();
    }
  }

  // Helper for common stuff to do when the owner changes.
  updateOwner() {
    if (this.owner) {
      this.owner_idx = this.owner.$.tank_idx;
      this.team = this.owner.$.team;
    } else {
      this.owner_idx = (this.team = 255);
    }
    return (this.cell != null ? this.cell.retile() : undefined);
  }

  // The state information to synchronize.
  serialization(isCreate, p) {
    p('O', 'owner');

    p('f', 'inTank');
    p('f', 'carried');
    p('f', 'haveTarget');

    if (!this.inTank && !this.carried) {
      p('H', 'x');
      p('H', 'y');
    } else {
      this.x = (this.y = null);
    }

    p('B', 'armour');
    p('B', 'speed');
    p('B', 'coolDown');
    return p('B', 'reload');
  }

  // Called when dropped by a tank, or placed by a builder.
  placeAt(cell) {
    this.inTank = (this.carried = false);
    [this.x, this.y] = Array.from(cell.getWorldCoordinates());
    this.updateCell();
    return this.reset();
  }

  //### World updates

  spawn() {
    return this.reset();
  }

  reset() {
    this.coolDown = 32;
    return this.reload = 0;
  }

  anySpawn() {
    return this.updateCell();
  }

  update() {
    let tank;
    if (this.inTank || this.carried) { return; }
    if (this.armour === 0) {
      this.haveTarget = false;

      for (tank of Array.from(this.world.tanks)) {
        if (tank.armour !== 255) {
          if (tank.cell === this.cell) {
            this.inTank = true; this.x = (this.y = null); this.updateCell();
            this.ref('owner', tank); this.updateOwner();
            break;
          }
        }
      }
      return;
    }

    this.reload = min(this.speed, this.reload + 1);
    if (--this.coolDown === 0) {
      this.coolDown = 32;
      this.speed = min(100, this.speed + 1);
    }
    if (!(this.reload >= this.speed)) { return; }

    let target = null; let targetDistance = Infinity;
    for (tank of Array.from(this.world.tanks)) {
      if ((tank.armour !== 255) && !(this.owner != null ? this.owner.$.isAlly(tank) : undefined)) {
        var d = distance(this, tank);
        if ((d <= 2048) && (d < targetDistance)) {
          target = tank; targetDistance = d;
        }
      }
    }
    if (!target) { return this.haveTarget = false; }

    // On the flank from idle to targetting, don't fire immediatly.
    if (this.haveTarget) {
      // FIXME: This code needs some helpers, taken from Tank.
      const rad = ((256 - (target.getDirection16th() * 16)) * 2 * PI) / 256;
      const x = target.x + ((targetDistance / 32) * round(cos(rad) * ceil(target.speed)));
      const y = target.y + ((targetDistance / 32) * round(sin(rad) * ceil(target.speed)));
      const direction = 256 - ((heading(this, {x, y}) * 256) / (2*PI));
      this.world.spawn(Shell, this, {direction});
      this.soundEffect(sounds.SHOOTING);
    }
    this.haveTarget = true;
    return this.reload = 0;
  }

  aggravate() {
    this.coolDown = 32;
    return this.speed = max(6, round(this.speed / 2));
  }

  takeShellHit(shell) {
    this.aggravate();
    this.armour = max(0, this.armour - 1);
    this.cell.retile();
    return sounds.SHOT_BUILDING;
  }

  takeExplosionHit() {
    this.armour = max(0, this.armour - 5);
    return this.cell.retile();
  }

  repair(trees) {
    const used = min(trees, ceil((15 - this.armour) / 4));
    this.armour = min(15, this.armour + (used*4));
    this.cell.retile();
    return used;
  }
}


//### Exports
module.exports = WorldPillbox;

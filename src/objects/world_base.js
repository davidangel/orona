/*
 * decaffeinate suggestions:
 * DS002: Fix invalid constructor
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
// The pillbox is a map object, and thus a slightly special case of world object.

const {min, max} = Math;
const {TILE_SIZE_WORLD} = require('../constants');
const {distance} = require('../helpers');
const BoloObject = require('../object');
const sounds     = require('../sounds');


class WorldBase extends BoloObject {

  // This is a MapObject; it is constructed differently on the server.
  constructor(world_or_map, x, y, owner_idx, armour, shells, mines) {
    super(...arguments);
    this.owner_idx = owner_idx;
    this.armour = armour;
    this.shells = shells;
    this.mines = mines;
    if (arguments.length === 1) {
      this.world = world_or_map;
    } else {
      this.x = (x + 0.5) * TILE_SIZE_WORLD; this.y = (y + 0.5) * TILE_SIZE_WORLD;
      // Override the cell's type.
      world_or_map.cellAtTile(x, y).setType('=', false, -1);
    }

    // Keep track of owner changes.
    this.on('netUpdate', changes => {
      if (changes.hasOwnProperty('owner')) {
        return this.updateOwner();
      }
    });
  }

  // The state information to synchronize.
  serialization(isCreate, p) {
    if (isCreate) {
      p('H', 'x');
      p('H', 'y');
    }

    p('O', 'owner');
    p('O', 'refueling');
    if (this.refueling) {
      p('B', 'refuelCounter');
    }
    p('B', 'armour');
    p('B', 'shells');
    return p('B', 'mines');
  }

  // Helper for common stuff to do when the owner changes.
  updateOwner() {
    if (this.owner) {
      this.owner_idx = this.owner.$.tank_idx;
      this.team = this.owner.$.team;
    } else {
      this.owner_idx = (this.team = 255);
    }
    return this.cell.retile();
  }

  //### World updates

  anySpawn() {
    this.cell = this.world.map.cellAtWorld(this.x, this.y);
    return this.cell.base = this;
  }

  update() {
    if (this.refueling && ((this.refueling.$.cell !== this.cell) || (this.refueling.$.armour === 255))) {
      this.ref('refueling', null);
    }

    if (!this.refueling) { return this.findSubject(); }
    if (--this.refuelCounter !== 0) { return; }
    // We're clear to transfer some resources to the tank.

    if ((this.armour > 0) && (this.refueling.$.armour < 40)) {
      const amount = min(5, this.armour, 40 - this.refueling.$.armour);
      this.refueling.$.armour += amount;
      this.armour -= amount;
      return this.refuelCounter = 46;
    } else if ((this.shells > 0) && (this.refueling.$.shells < 40)) {
      this.refueling.$.shells += 1;
      this.shells -= 1;
      return this.refuelCounter = 7;
    } else if ((this.mines > 0) && (this.refueling.$.mines < 40)) {
      this.refueling.$.mines += 1;
      this.mines -= 1;
      return this.refuelCounter = 7;
    } else {
      return this.refuelCounter = 1;
    }
  }

  // Look for someone to refuel, and check if he's claiming us too. Be careful to prevent rapid
  // reclaiming if two tanks are on the same tile.
  findSubject() {
    let tank;
    const tanks = (() => {
      const result = [];
      for (tank of Array.from(this.world.tanks)) {         if ((tank.armour !== 255) && (tank.cell === this.cell)) {
          result.push(tank);
        }
      }
      return result;
    })();
    for (tank of Array.from(tanks)) {
      if (this.owner != null ? this.owner.$.isAlly(tank) : undefined) {
        this.ref('refueling', tank);
        this.refuelCounter = 46;
        break;
      } else {
        var canClaim = true;
        for (var other of Array.from(tanks)) {
          if (other !== tank) {
            if (!tank.isAlly(other)) { canClaim = false; }
          }
        }
        if (canClaim) {
          this.ref('owner', tank); this.updateOwner();
          this.owner.on('destroy', () => { this.ref('owner', null); return this.updateOwner(); });
          this.ref('refueling', tank);
          this.refuelCounter = 46;
          break;
        }
      }
    }
  }

  takeShellHit(shell) {
    if (this.owner) {
      for (var pill of Array.from(this.world.map.pills)) {
        if (!(pill.inTank || pill.carried) && (pill.armour > 0)) {
          if ((pill.owner != null ? pill.owner.$.isAlly(this.owner.$) : undefined) && (distance(this, pill) <= 2304)) {
            pill.aggravate();
          }
        }
      }
    }
    this.armour = max(0, this.armour - 5);
    return sounds.SHOT_BUILDING;
  }
}


//### Exports
module.exports = WorldBase;

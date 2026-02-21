/*
 * decaffeinate suggestions:
 * DS002: Fix invalid constructor
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
// You shoot these. Many, in fact. With intent. At your opponent. Or perhaps some other obstacle.

const {round, floor, cos, sin, PI} = Math;
const {distance} = require('../helpers');
const BoloObject        = require('../object');
const {TILE_SIZE_WORLD} = require('../constants');
const Explosion         = require('./explosion');
const MineExplosion     = require('./mine_explosion');


// This is the interface the handful of destructable objects implement. I'm talking about terrain
// (thus map cells), tanks, bases and pillboxes. Actually, bases are indestructable. But Hittable
// sounds too cheesy.
//
// The basic premise is a single method `takeShellHit` that receives the Shell object, so that it
// may possibly inspect its owner. The return value should be an impact sound effect name.
class Destructable {

  takeShellHit(shell) {}
}


class Shell extends BoloObject {
  static initClass() {
  
    this.prototype.updatePriority = 20;
    this.prototype.styled = false;
  }

  constructor(world) {
    super(...arguments);
    // Track position updates.
    this.spawn = this.spawn.bind(this);
    this.world = world;
    this.on('netSync', () => {
      return this.updateCell();
    });
  }

  serialization(isCreate, p) {
    if (isCreate) {
      p('B', 'direction');
      p('O', 'owner');
      p('O', 'attribution');
      p('f', 'onWater');
    }

    p('H', 'x');
    p('H', 'y');
    return p('B', 'lifespan');
  }

  // Helper, called in several places that change shell position.
  updateCell() {
    return this.cell = this.world.map.cellAtWorld(this.x, this.y);
  }

  // Get the 1/16th direction step.
  getDirection16th() { return round((this.direction - 1) / 16) % 16; }

  // Get the tilemap index to draw. This is the index in base.png.
  getTile() {
    const tx = this.getDirection16th();
    return [tx, 4];
  }

  //### World updates

  spawn(owner, options) {
    if (!options) { options = {}; }

    this.ref('owner', owner);
    if (this.owner.$.hasOwnProperty('owner_idx')) {
      this.ref('attribution', this.owner.$.owner != null ? this.owner.$.owner.$ : undefined);
    } else {
      this.ref('attribution', this.owner.$);
    }

    // Default direction is the owner's.
    this.direction = options.direction || this.owner.$.direction;
    // Default lifespan (fired by pillboxes) is 7 tiles.
    this.lifespan = (((options.range || 7) * TILE_SIZE_WORLD) / 32) - 2;
    // Default for onWater (fired by pillboxes) is no.
    this.onWater = options.onWater || false;
    // Start at the owner's location, and move one step away.
    this.x = this.owner.$.x; this.y = this.owner.$.y;
    return this.move();
  }

  update() {
    let x, y;
    this.move();
    const collision = this.collide();
    if (collision) {
      const [mode, victim] = Array.from(collision);
      const sfx = victim.takeShellHit(this);
      if (mode === 'cell') {
        [x, y] = Array.from(this.cell.getWorldCoordinates());
        this.world.soundEffect(sfx, x, y);
      } else { // mode == 'tank'
        ({x, y} = this);
        victim.soundEffect(sfx);
      }
      return this.asplode(x, y, mode);
    } else if (this.lifespan-- === 0) {
      return this.asplode(this.x, this.y, 'eol');
    }
  }

  move() {
    if (!this.radians) { this.radians = ((256 - this.direction) * 2 * PI) / 256; }
    this.x += round(cos(this.radians) * 32);
    this.y += round(sin(this.radians) * 32);
    return this.updateCell();
  }

  collide() {
    // Check for a collision with a pillbox, but not our owner.
    let base, pill;
    if ((pill = this.cell.pill) && (pill.armour > 0) && (pill !== (this.owner != null ? this.owner.$ : undefined))) {
      const [x, y] = Array.from(this.cell.getWorldCoordinates());
      if (distance(this, {x, y}) <= 127) { return ['cell', pill]; }
    }

    // Check for collision with tanks. Carefully avoid hitting our owner when fired from a tank.
    // At the same time, remember that a pillbox *can* hit its owner.
    for (var tank of Array.from(this.world.tanks)) {
      if ((tank !== (this.owner != null ? this.owner.$ : undefined)) && (tank.armour !== 255)) {
        if (distance(this, tank) <= 127) { return ['tank', tank]; }
      }
    }

    // When fired from a tank, check for collision with enemy base.
    if (((this.attribution != null ? this.attribution.$ : undefined) === (this.owner != null ? this.owner.$ : undefined)) && (base = this.cell.base) && (base.armour > 4)) {
      if (this.onWater || (((base != null ? base.owner : undefined) != null) && !base.owner.$.isAlly(this.attribution != null ? this.attribution.$ : undefined))) {
        return ['cell', base];
      }
    }

    // Check for terrain collision
    const terrainCollision =
      this.onWater ?
        !this.cell.isType('^', ' ', '%')
      :
        this.cell.isType('|', '}', '#', 'b');
    if (terrainCollision) { return ['cell', this.cell]; }
  }

  asplode(x, y, mode) {
    for (var tank of Array.from(this.world.tanks)) {
      var builder;
      if ((builder = tank.builder.$)) {
        if (![builder.states.inTank, builder.states.parachuting].includes(builder.order)) {
          if (mode === 'cell') {
            if (builder.cell === this.cell) { builder.kill(); }
          } else {
            if (distance(this, builder) < (TILE_SIZE_WORLD / 2)) { builder.kill(); }
          }
        }
      }
    }
    this.world.spawn(Explosion, x, y);
    this.world.spawn(MineExplosion, this.cell);
    return this.world.destroy(this);
  }
}
Shell.initClass();


//### Exports
module.exports = Shell;

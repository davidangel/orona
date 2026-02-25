/*
 * decaffeinate suggestions:
 * DS002: Fix invalid constructor
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS202: Simplify dynamic range loops
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
// The Tank class contains all the logic you need to tread well. (And all the other logic needed
// to punish you if you don't.)

const {round, floor, ceil, min, sqrt, max, sin, cos, PI} = Math;
const {TILE_SIZE_WORLD} = require('../constants');
const {distance} = require('../helpers');
const BoloObject        = require('../object');
const sounds            = require('../sounds');
const Explosion         = require('./explosion');
const MineExplosion     = require('./mine_explosion');
const Shell             = require('./shell');
const Fireball          = require('./fireball');
const Builder           = require('./builder');


class Tank extends BoloObject {
  static initClass() {
  
    this.prototype.styled = true;
  }

  // Tanks are only ever spawned and destroyed on the server.
  constructor(world) {
    super(...arguments);
    // Track position updates.
    this.world = world;
    this.on('netUpdate', changes => {
      if (changes.hasOwnProperty('x') || changes.hasOwnProperty('y') || (changes.armour === 255)) {
        return this.updateCell();
      }
    });
  }

  // Keep the player list updated.
  anySpawn() {
    this.updateCell();
    this.world.addTank(this);
    this.setMaxListeners(50);
    if (!this._finalizeListenerAdded) {
      this._finalizeListenerAdded = true;
      this.on('finalize', () => this.world.removeTank(this));
    }
    return this;
  }

  // Helper, called in several places that change tank position.
  updateCell() {
    return this.cell =
      (this.x != null) && (this.y != null) ?
        this.world.map.cellAtWorld(this.x, this.y)
      :
        null;
  }

  // (Re)spawn the tank. Initializes all state. Only ever called on the server.
  reset() {
    const startingPos = this.world.map.getRandomStart();
    [this.x, this.y] = Array.from(startingPos.cell.getWorldCoordinates());
    this.direction = startingPos.direction * 16;
    this.updateCell();

    this.speed          = 0.00;
    this.slideTicks     = 0;
    this.slideDirection = 0;
    this.accelerating   = false;
    this.braking        = false;

    this.turningClockwise        = false;
    this.turningCounterClockwise = false;
    this.turnSpeedup             = 0;

    // FIXME: gametype dependant.
    this.shells = 40;
    this.mines  = 0;
    this.armour = 40;
    this.trees  = 0;

    this.reload   = 0;
    this.shooting = false;
    this.firingRange = 7;

    this.waterTimer = 0;
    return this.onBoat = true;
  }

  serialization(isCreate, p) {
    if (isCreate) {
      p('B', 'team');
      p('O', 'builder');
    }

    p('B', 'armour');

    // Are we dead?
    if (this.armour === 255) {
      p('O', 'fireball');
      this.x = (this.y = null);
      return;
    } else {
      if (this.fireball != null) {
        this.fireball.clear();
      }
    }

    p('H', 'x');
    p('H', 'y');
    p('B', 'direction');
    // Uses 0.25 increments, so we can pack this as a byte.
    p('B', 'speed', {
      tx(v) { return v * 4; },
      rx(v) { return v / 4; }
    }
    );
    p('B', 'slideTicks');
    p('B', 'slideDirection');
    // FIXME: should simply be a signed byte.
    p('B', 'turnSpeedup', {
      tx(v) { return v + 50; },
      rx(v) { return v - 50; }
    }
    );
    p('B', 'shells');
    p('B', 'mines');
    p('B', 'trees');
    p('B', 'reload');
    p('B', 'firingRange', {
      tx(v) { return v * 2; },
      rx(v) { return v / 2; }
    }
    );
    p('B', 'waterTimer');

    // Group bit fields.
    p('f', 'accelerating');
    p('f', 'braking');
    p('f', 'turningClockwise');
    p('f', 'turningCounterClockwise');
    p('f', 'shooting');
    return p('f', 'onBoat');
  }


  // Get the 1/16th direction step.
  // FIXME: Should move our angle-related calculations to a separate module or so.
  getDirection16th() { return round((this.direction - 1) / 16) % 16; }
  getSlideDirection16th() { return round((this.slideDirection - 1) / 16) % 16; }

  // Return an array of pillboxes this tank is carrying.
  getCarryingPillboxes() {
    return Array.from(this.world.map.pills).filter((pill) => pill.inTank && ((pill.owner != null ? pill.owner.$ : undefined) === this));
  }

  // Get the tilemap index to draw. This is the index in styled.png.
  getTile() {
    const tx = this.getDirection16th();
    const ty = this.onBoat ? 1 : 0;
    return [tx, ty];
  }

  // Tell whether the other tank is an ally.
  isAlly(other) { return (other === this) || ((this.team !== 255) && (other.team === this.team)); }

  // Adjust the firing range.
  increaseRange() { return this.firingRange = min(7, this.firingRange + 0.5); }
  decreaseRange() { return this.firingRange = max(1, this.firingRange - 0.5); }

  // We've taken a hit. Check if we were killed, otherwise slide and possibly kill our boat.
  takeShellHit(shell) {
    this.armour -= 5;
    if (this.armour < 0) {
      const largeExplosion = (this.shells + this.mines) > 20;
      this.ref('fireball', this.world.spawn(Fireball, this.x, this.y, shell.direction, largeExplosion));
      this.kill();
    } else {
      this.slideTicks = 8;
      this.slideDirection = shell.direction;
      if (this.onBoat) {
        this.onBoat = false;
        this.speed = 0;
        if (this.cell.isType('^')) { this.sink(); }
      }
    }
    return sounds.HIT_TANK;
  }

  // We've taken a hit from a mine. Mostly similar to the above.
  takeMineHit() {
    this.armour -= 10;
    if (this.armour < 0) {
      const largeExplosion = (this.shells + this.mines) > 20;
      this.ref('fireball', this.world.spawn(Fireball, this.x, this.y, this.direction, largeExplosion));
      return this.kill();
    } else if (this.onBoat) {
      this.onBoat = false;
      this.speed = 0;
      if (this.cell.isType('^')) { return this.sink(); }
    }
  }


  //### World updates

  spawn(team) {
    this.team = team;
    this.reset();
    return this.ref('builder', this.world.spawn(Builder, this));
  }

  update() {
    if (this.death()) { return; }
    this.shootOrReload();
    this.turn();
    this.accelerate();
    this.fixPosition();
    return this.move();
  }

  destroy() {
    this.dropPillboxes();
    return this.world.destroy(this.builder.$);
  }

  death() {
    if (this.armour !== 255) { return false; }

    // Count down ticks from 255, before respawning.
    if (this.world.authority && (--this.respawnTimer === 0)) {
      delete this.respawnTimer;
      this.reset();
      return false;
    }

    return true;
  }

  shootOrReload() {
    if (this.reload > 0) { this.reload--; }
    if (!this.shooting || (this.reload !== 0) || !(this.shells > 0)) { return; }
    // We're clear to fire a shot.

    this.shells--; this.reload = 13;
    this.world.spawn(Shell, this, {range: this.firingRange, onWater: this.onBoat});
    return this.soundEffect(sounds.SHOOTING);
  }

  turn() {
    // Determine turn rate.
    let acceleration;
    const maxTurn = this.cell.getTankTurn(this);

    // Are the key presses cancelling eachother out?
    if (this.turningClockwise === this.turningCounterClockwise) {
      this.turnSpeedup = 0;
      return;
    }

    // Determine angular acceleration, and apply speed-up.
    if (this.turningCounterClockwise) {
      acceleration = maxTurn;
      if (this.turnSpeedup < 10) { acceleration /= 2; }
      if (this.turnSpeedup < 0) { this.turnSpeedup = 0; }
      this.turnSpeedup++;
    } else { // if @turningClockwise
      acceleration = -maxTurn;
      if (this.turnSpeedup > -10) { acceleration /= 2; }
      if (this.turnSpeedup > 0) { this.turnSpeedup = 0; }
      this.turnSpeedup--;
    }

    // Turn the tank.
    this.direction += acceleration;
    // Normalize direction.
    while (this.direction < 0) { this.direction += 256; }
    if (this.direction >= 256) { return this.direction %= 256; }
  }

  accelerate() {
    // Determine acceleration.
    let acceleration;
    const maxSpeed = this.cell.getTankSpeed(this);
    // Is terrain forcing us to slow down?
    if (this.speed > maxSpeed) { acceleration = -0.25;
    // Are key presses cancelling eachother out?
    } else if (this.accelerating === this.braking) { acceleration = 0.00;
    // What's does the player want to do?
    } else if (this.accelerating) { acceleration = 0.25;
    } else { acceleration = -0.25; } // if @breaking
    // Adjust speed, and clip as necessary.
    if ((acceleration > 0.00) && (this.speed < maxSpeed)) {
      return this.speed = min(maxSpeed, this.speed + acceleration);
    } else if ((acceleration < 0.00) && (this.speed > 0.00)) {
      return this.speed = max(0.00, this.speed + acceleration);
    }
  }

  fixPosition() {
    // Check to see if there's a solid underneath the tank. This could happen if some other player
    // builds underneath us. In that case, we try to nudge the tank off the solid.
    if (this.cell.getTankSpeed(this) === 0) {
      const halftile = TILE_SIZE_WORLD / 2;
      if ((this.x % TILE_SIZE_WORLD) >= halftile) { this.x++; } else { this.x--; }
      if ((this.y % TILE_SIZE_WORLD) >= halftile) { this.y++; } else { this.y--; }
      this.speed = max(0.00, this.speed - 1);
    }

    // Also check if we're on top of another tank.
    return (() => {
      const result = [];
      for (var other of Array.from(this.world.tanks)) {
        if ((other !== this) && (other.armour !== 255)) {
          if (!(distance(this, other) > 255)) {
            // FIXME: winbolo actually does an increasing size of nudges while the tanks are colliding,
            // keeping a static/global variable. But perhaps this should be combined with tank sliding?
            if (other.x < this.x) { this.x++; } else { this.x--; }
            if (other.y < this.y) { result.push(this.y++); } else { result.push(this.y--); }
          } else {
            result.push(undefined);
          }
        }
      }
      return result;
    })();
  }

  move() {
    let ahead, dy, rad;
    let dx = (dy = 0);
    // FIXME: Our angle unit should match more closely that of JavaScript.
    if (this.speed > 0) {
      rad = ((256 - (this.getDirection16th() * 16)) * 2 * PI) / 256;
      dx += round(cos(rad) * ceil(this.speed));
      dy += round(sin(rad) * ceil(this.speed));
    }
    if (this.slideTicks > 0) {
      rad = ((256 - (this.getSlideDirection16th() * 16)) * 2 * PI) / 256;
      dx += round(cos(rad) * 16);
      dy += round(sin(rad) * 16);
      this.slideTicks--;
    }
    const newx = this.x + dx; const newy = this.y + dy;

    let slowDown = true;

    // Check if we're running into an obstacle in either axis direction.
    if (dx !== 0) {
      ahead = dx > 0 ? newx + 64 : newx - 64;
      ahead = this.world.map.cellAtWorld(ahead, newy);
      if (ahead.getTankSpeed(this) !== 0) {
        slowDown = false;
        if (!this.onBoat || !!ahead.isType(' ', '^') || !(this.speed < 16)) { this.x = newx; }
      }
    }

    if (dy !== 0) {
      ahead = dy > 0 ? newy + 64 : newy - 64;
      ahead = this.world.map.cellAtWorld(newx, ahead);
      if (ahead.getTankSpeed(this) !== 0) {
        slowDown = false;
        if (!this.onBoat || !!ahead.isType(' ', '^') || !(this.speed < 16)) { this.y = newy; }
      }
    }

    if ((dx !== 0) || (dy !== 0)) {
      // If we're completely obstructed, reduce our speed.
      if (slowDown) {
        this.speed = max(0.00, this.speed - 1);
      }

      // Update the cell reference.
      const oldcell = this.cell;
      this.updateCell();

      // Check our new terrain if we changed cells.
      if (oldcell !== this.cell) { this.checkNewCell(oldcell); }
    }

    if (!this.onBoat && (this.speed <= 3) && this.cell.isType(' ')) {
      if (++this.waterTimer === 15) {
        if ((this.shells !== 0) || (this.mines !== 0)) { this.soundEffect(sounds.BUBBLES); }
        this.shells = max(0, this.shells - 1);
        this.mines  = max(0, this.mines  - 1);
        return this.waterTimer = 0;
      }
    } else {
      return this.waterTimer = 0;
    }
  }

  checkNewCell(oldcell) {
    // FIXME: check for mine impact
    // FIXME: Reveal hidden mines nearby

    // Check if we just entered or left the water.
    if (this.onBoat) {
      if (!this.cell.isType(' ', '^')) { this.leaveBoat(oldcell); }
    } else {
      if (this.cell.isType('^')) { return this.sink(); }
      if (this.cell.isType('b')) { this.enterBoat(); }
    }

    if (this.cell.mine) { return this.world.spawn(MineExplosion, this.cell); }
  }

  leaveBoat(oldcell) {
    // Check if we're running over another boat; destroy it if so.
    if (this.cell.isType('b')) {
      // Don't need to retile surrounding cells for this.
      this.cell.setType(' ', false, 0);
      // Create a small explosion at the center of the tile.
      const x = (this.cell.x + 0.5) * TILE_SIZE_WORLD; const y = (this.cell.y + 0.5) * TILE_SIZE_WORLD;
      this.world.spawn(Explosion, x, y);
      return this.world.soundEffect(sounds.SHOT_BUILDING, x, y);
    } else {
      // Leave a boat if we were on a river.
      if (oldcell.isType(' ')) {
        // Don't need to retile surrounding cells for this.
        oldcell.setType('b', false, 0);
      }
      return this.onBoat = false;
    }
  }

  enterBoat() {
    // Don't need to retile surrounding cells for this.
    this.cell.setType(' ', false, 0);
    return this.onBoat = true;
  }

  sink() {
    this.world.soundEffect(sounds.TANK_SINKING, this.x, this.y);
    // FIXME: Somehow blame a killer, if instigated by a shot?
    return this.kill();
  }

  kill() {
    // FIXME: Message the other players. Probably want a scoreboard too.
    this.dropPillboxes();
    this.x = (this.y = null);
    this.armour = 255;
    // The respawnTimer attribute exists only on the server.
    // It is deleted once the timer is triggered, which happens in death().
    return this.respawnTimer = 255;
  }

  // Drop all pillboxes we own in a neat square area.
  dropPillboxes() {
    const pills = this.getCarryingPillboxes();
    if (pills.length === 0) { return; }

    let {
      x
    } = this.cell; let sy = this.cell.y;
    let width = sqrt(pills.length);
    const delta = floor(width / 2);
    width = round(width);
    x -= delta; sy -= delta;
    const ey = sy + width;

    while (pills.length !== 0) {
      for (var y = sy, end = ey, asc = sy <= end; asc ? y < end : y > end; asc ? y++ : y--) {
        var pill;
        var cell = this.world.map.cellAtTile(x, y);
        if ((cell.base != null) || (cell.pill != null) || cell.isType('|', '}', 'b')) { continue; }
        if (!(pill = pills.pop())) { return; }
        pill.placeAt(cell);
      }
      x += 1;
    }
  }
}
Tank.initClass();


//### Exports
module.exports = Tank;

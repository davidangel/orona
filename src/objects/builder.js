/*
 * decaffeinate suggestions:
 * DS002: Fix invalid constructor
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS104: Avoid inline assignments
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
const {round, floor, ceil, min, cos, sin} = Math;
const {TILE_SIZE_WORLD} = require('../constants');
const {distance, heading} = require('../helpers');
const BoloObject    = require('../object');
const sounds        = require('../sounds');
const MineExplosion = require('./mine_explosion');


class Builder extends BoloObject {
  static initClass() {
  
    this.prototype.states = {
      inTank:       0,
      waiting:      1,
      returning:    2,
      parachuting:  3,
  
      actions: {
        _min:       10,
        forest:     10,
        road:       11,
        repair:     12,
        boat:       13,
        building:   14,
        pillbox:    15,
        mine:       16
      }
    };
  
    this.prototype.styled = true;
  }

  // Builders are only ever spawned and destroyed on the server.
  constructor(world) {
    // Track position updates.
      super(...arguments);
      this.world = world;
    this.on('netUpdate', changes => {
      if (changes.hasOwnProperty('x') || changes.hasOwnProperty('y')) {
        return this.updateCell();
      }
    });
  }

  // Helper, called in several places that change builder position.
  updateCell() {
    return this.cell =
      (this.x != null) && (this.y != null) ?
        this.world.map.cellAtWorld(this.x, this.y)
      :
        null;
  }

  serialization(isCreate, p) {
    if (isCreate) {
      p('O', 'owner');
    }

    p('B', 'order');
    if (this.order === this.states.inTank) {
      this.x = (this.y = null);
    } else {
      p('H', 'x');
      p('H', 'y');
      p('H', 'targetX');
      p('H', 'targetY');
      p('B', 'trees');
      p('O', 'pillbox');
      p('f', 'hasMine');
    }
    if (this.order === this.states.waiting) {
      return p('B', 'waitTimer');
    }
  }

  getTile() {
    if (this.order === this.states.parachuting) { return [16, 1];
    } else { return [17, floor(this.animation / 3)]; }
  }

  performOrder(action, trees, cell) {
    if (this.order !== this.states.inTank) { return; }
    if (!this.owner.$.onBoat && (this.owner.$.cell !== cell) && !(this.owner.$.cell.getManSpeed(this) > 0)) { return; }
    let pill = null;
    if (action === 'mine') {
      if (this.owner.$.mines === 0) { return; }
      trees = 0;
    } else {
      if (this.owner.$.trees < trees) { return; }
      if (action === 'pillbox') {
        if (!(pill = this.owner.$.getCarryingPillboxes().pop())) { return; }
        pill.inTank = false; pill.carried = true;
      }
    }

    this.trees = trees;
    this.hasMine = (action === 'mine');
    this.ref('pillbox', pill);
    if (this.hasMine) { this.owner.$.mines--; }
    this.owner.$.trees -= trees;

    this.order = this.states.actions[action];
    this.x = this.owner.$.x; this.y = this.owner.$.y;
    [this.targetX, this.targetY] = Array.from(cell.getWorldCoordinates());
    return this.updateCell();
  }

  kill() {
    let ref;
    if (!this.world.authority) { return; }
    this.soundEffect(sounds.MAN_DYING);
    this.order = this.states.parachuting;
    this.trees = 0; this.hasMine = false;
    if (this.pillbox) {
      this.pillbox.$.placeAt(this.cell);
      this.ref('pillbox', null);
    }
    if (this.owner.$.armour === 255) {
      [this.targetX, this.targetY] = Array.from([this.x, this.y]);
    } else {
      [this.targetX, this.targetY] = Array.from([this.owner.$.x, this.owner.$.y]);
    }
    const startingPos = this.world.map.getRandomStart();
    return [this.x, this.y] = Array.from(ref = startingPos.cell.getWorldCoordinates()), ref;
  }


  //### World updates

  spawn(owner) {
    this.ref('owner', owner);
    return this.order = this.states.inTank;
  }

  anySpawn() {
    this.team = this.owner.$.team;
    return this.animation = 0;
  }

  update() {
    if (this.order === this.states.inTank) { return; }
    this.animation = (this.animation + 1) % 9;

    switch (this.order) {
      case this.states.waiting:
        if (this.waitTimer-- === 0) { return this.order = this.states.returning; }
        break;
      case this.states.parachuting:
        return this.parachutingIn({x: this.targetX, y: this.targetY});
      case this.states.returning:
        if (this.owner.$.armour !== 255) { return this.move(this.owner.$, 128, 160); }
        break;
      default:
        return this.move({ x: this.targetX, y: this.targetY }, 16, 144);
    }
  }

  move(target, targetRadius, boatRadius) {
    // Get our speed, and keep in mind special places a builder can move to.
    let ahead, dx, dy;
    let speed = this.cell.getManSpeed(this);
    let onBoat = false;
    const targetCell = this.world.map.cellAtWorld(this.targetX, this.targetY);
    if ((speed === 0) && (this.cell === targetCell)) {
      speed = 16;
    }
    if ((this.owner.$.armour !== 255) && this.owner.$.onBoat && (distance(this, this.owner.$) < boatRadius)) {
      onBoat = true;
      speed = 16;
    }

    // Determine how far to move.
    speed = min(speed, distance(this, target));
    const rad = heading(this, target);
    const newx = this.x + (dx = round(cos(rad) * ceil(speed)));
    const newy = this.y + (dy = round(sin(rad) * ceil(speed)));

    // Check if we're running into an obstacle in either axis direction.
    let movementAxes = 0;
    if (dx !== 0) {
      ahead = this.world.map.cellAtWorld(newx, this.y);
      if (onBoat || (ahead === targetCell) || (ahead.getManSpeed(this) > 0)) {
        this.x = newx; movementAxes++;
      }
    }
    if (dy !== 0) {
      ahead = this.world.map.cellAtWorld(this.x, newy);
      if (onBoat || (ahead === targetCell) || (ahead.getManSpeed(this) > 0)) {
        this.y = newy; movementAxes++;
      }
    }

    // Are we there yet?
    if (movementAxes === 0) {
      return this.order = this.states.returning;
    } else {
      this.updateCell();
      if (distance(this, target) <= targetRadius) { return this.reached(); }
    }
  }

  reached() {
    // Builder has returned to tank. Jump into the tank, and return resources.
    if (this.order === this.states.returning) {
      this.order = this.states.inTank;
      this.x = (this.y = null);

      if (this.pillbox) {
        this.pillbox.$.inTank = true; this.pillbox.$.carried = false;
        this.ref('pillbox', null);
      }
      this.owner.$.trees = min(40, this.owner.$.trees + this.trees);
      this.trees = 0;
      if (this.hasMine) { this.owner.$.mines = min(40, this.owner.$.mines + 1); }
      this.hasMine = false;
      return;
    }

    // Is the builder trying to build on a mine? Yowch!
    if (this.cell.mine) {
      this.world.spawn(MineExplosion, this.cell);
      this.order = this.states.waiting;
      this.waitTimer = 20;
      return;
    }

    // Otherwise, build.
    // FIXME: possibly merge these checks with `checkBuildOrder`.
    switch (this.order) {
      case this.states.actions.forest:
        if (this.cell.base || this.cell.pill || !this.cell.isType('#')) { break; }
        this.cell.setType('.'); this.trees = 4;
        this.soundEffect(sounds.FARMING_TREE);
        break;
      case this.states.actions.road:
        if (this.cell.base || this.cell.pill || this.cell.isType('|', '}', 'b', '^', '#', '=')) { break; }
        if (this.cell.isType(' ') && this.cell.hasTankOnBoat()) { break; }
        this.cell.setType('='); this.trees = 0;
        this.soundEffect(sounds.MAN_BUILDING);
        break;
      case this.states.actions.repair:
        if (this.cell.pill) {
          const used = this.cell.pill.repair(this.trees); this.trees -= used;
        } else if (this.cell.isType('}')) {
          this.cell.setType('|'); this.trees = 0;
        } else {
          break;
        }
        this.soundEffect(sounds.MAN_BUILDING);
        break;
      case this.states.actions.boat:
        if (!this.cell.isType(' ') || !!this.cell.hasTankOnBoat()) { break; }
        this.cell.setType('b'); this.trees = 0;
        this.soundEffect(sounds.MAN_BUILDING);
        break;
      case this.states.actions.building:
        if (this.cell.base || this.cell.pill || this.cell.isType('b', '^', '#', '}', '|', ' ')) { break; }
        this.cell.setType('|'); this.trees = 0;
        this.soundEffect(sounds.MAN_BUILDING);
        break;
      case this.states.actions.pillbox:
        if (this.cell.pill || this.cell.base || this.cell.isType('b', '^', '#', '|', '}', ' ')) { break; }
        this.pillbox.$.armour = 15; this.trees = 0;
        this.pillbox.$.placeAt(this.cell); this.ref('pillbox', null);
        this.soundEffect(sounds.MAN_BUILDING);
        break;
      case this.states.actions.mine:
        if (this.cell.base || this.cell.pill || this.cell.isType('^', ' ', '|', 'b', '}')) { break; }
        this.cell.mineOwner = this.team;
        this.cell.setType(null, true, 0);
        this.hasMine = false;
        this.soundEffect(sounds.MAN_LAY_MINE);
        break;
    }

    // Short pause while/after we build.
    this.order = this.states.waiting;
    return this.waitTimer = 20;
  }

  parachutingIn(target) {
    if (distance(this, target) <= 16) {
      return this.order = this.states.returning;
    } else {
      const rad = heading(this, target);
      this.x += round(cos(rad) * 3);
      this.y += round(sin(rad) * 3);
      return this.updateCell();
    }
  }
}
Builder.initClass();


//# Exports
module.exports = Builder;

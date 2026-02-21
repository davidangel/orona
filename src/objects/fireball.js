/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
// A fireball is the trail of fire left by a dying tank.

const {round, cos,
 sin, PI}         = Math;
const {TILE_SIZE_WORLD} = require('../constants');
const sounds            = require('../sounds');
const BoloObject        = require('../object');
const Explosion         = require('./explosion');


class Fireball extends BoloObject {
  static initClass() {
  
    this.prototype.styled = null;
  }

  serialization(isCreate, p) {
    if (isCreate) {
      p('B', 'direction');
      p('f', 'largeExplosion');
    }

    p('H', 'x');
    p('H', 'y');
    return p('B', 'lifespan');
  }

  // Get the 1/16th direction step.
  getDirection16th() { return round((this.direction - 1) / 16) % 16; }

  //### World updates

  spawn(x, y, direction, largeExplosion) {
    this.x = x;
    this.y = y;
    this.direction = direction;
    this.largeExplosion = largeExplosion;
    return this.lifespan = 80;
  }

  update() {
    if ((this.lifespan-- % 2) === 0) {
      if (this.wreck()) { return; }
      this.move();
    }
    if (this.lifespan === 0) {
      this.explode();
      return this.world.destroy(this);
    }
  }

  wreck() {
    this.world.spawn(Explosion, this.x, this.y);
    const cell = this.world.map.cellAtWorld(this.x, this.y);
    if (cell.isType('^')) {
      this.world.destroy(this);
      this.soundEffect(sounds.TANK_SINKING);
      return true;
    } else if (cell.isType('b')) {
      cell.setType(' ');
      this.soundEffect(sounds.SHOT_BUILDING);
    } else if (cell.isType('#')) {
      cell.setType('.');
      this.soundEffect(sounds.SHOT_TREE);
    }
    return false;
  }

  move() {
    let ahead;
    if (this.dx == null) {
      const radians = ((256 - this.direction) * 2 * PI) / 256;
      this.dx = round(cos(radians) * 48);
      this.dy = round(sin(radians) * 48);
    }

    const {dx, dy} = this;
    const newx = this.x + dx;
    const newy = this.y + dy;

    if (dx !== 0) {
      ahead = dx > 0 ? newx + 24 : newx - 24;
      ahead = this.world.map.cellAtWorld(ahead, newy);
      if (!ahead.isObstacle()) { this.x = newx; }
    }

    if (dy !== 0) {
      ahead = dy > 0 ? newy + 24 : newy - 24;
      ahead = this.world.map.cellAtWorld(newx, ahead);
      if (!ahead.isObstacle()) { return this.y = newy; }
    }
  }

  explode() {
    const cells = [this.world.map.cellAtWorld(this.x, this.y)];
    if (this.largeExplosion) {
      const dx = this.dx > 0 ? 1 : -1;
      const dy = this.dy > 0 ? 1 : -1;
      cells.push(cells[0].neigh(dx,  0));
      cells.push(cells[0].neigh( 0, dy));
      cells.push(cells[0].neigh(dx, dy));
      this.soundEffect(sounds.BIG_EXPLOSION);
    } else {
      this.soundEffect(sounds.MINE_EXPLOSION);
    }

    return (() => {
      const result = [];
      for (var cell of Array.from(cells)) {
        cell.takeExplosionHit();
        for (var tank of Array.from(this.world.tanks)) {
          var builder;
          if ((builder = tank.builder.$)) {
            if (![builder.states.inTank, builder.states.parachuting].includes(builder.order)) {
              if (builder.cell === cell) { builder.kill(); }
            }
          }
        }
        var [x, y] = Array.from(cell.getWorldCoordinates());
        result.push(this.world.spawn(Explosion, x, y));
      }
      return result;
    })();
  }
}
Fireball.initClass();


//### Exports
module.exports = Fireball;

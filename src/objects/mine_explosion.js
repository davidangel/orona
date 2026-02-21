/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS206: Consider reworking classes to avoid initClass
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
const {TILE_SIZE_WORLD} = require('../constants');
const {distance} = require('../helpers');
const BoloObject = require('../object');
const sounds     = require('../sounds');
const Explosion  = require('./explosion');


//# Mine explosion

// An invisible object, which triggers a mine after a short delay. These are always spawned when
// mines are supposed to be triggered, even if there is no mine on the cell at the time.

class MineExplosion extends BoloObject {
  static initClass() {
  
    this.prototype.styled = null;
  }

  serialization(isCreate, p) {
    if (isCreate) {
      p('H', 'x');
      p('H', 'y');
    }

    return p('B', 'lifespan');
  }

  //### World updates

  spawn(cell) {
    [this.x, this.y] = Array.from(cell.getWorldCoordinates());
    return this.lifespan = 10;
  }

  anySpawn() {
    return this.cell = this.world.map.cellAtWorld(this.x, this.y);
  }

  update() {
    if (this.lifespan-- === 0) {
      if (this.cell.mine) { this.asplode(); }
      return this.world.destroy(this);
    }
  }

  asplode() {
    this.cell.setType(null, false, 0);

    this.cell.takeExplosionHit();
    for (var tank of Array.from(this.world.tanks)) {
      if ((tank.armour !== 255) && (distance(this, tank) < 384)) { tank.takeMineHit(); }
      var builder = tank.builder.$;
      if (![builder.states.inTank, builder.states.parachuting].includes(builder.order)) {
        if (distance(this, builder) < (TILE_SIZE_WORLD / 2)) { builder.kill(); }
      }
    }

    this.world.spawn(Explosion, this.x, this.y);
    this.soundEffect(sounds.MINE_EXPLOSION);
    return this.spread();
  }

  spread() {
    let n = this.cell.neigh( 1,  0); if (!n.isEdgeCell()) { this.world.spawn(MineExplosion, n); }
    n = this.cell.neigh( 0,  1); if (!n.isEdgeCell()) { this.world.spawn(MineExplosion, n); }
    n = this.cell.neigh(-1,  0); if (!n.isEdgeCell()) { this.world.spawn(MineExplosion, n); }
    n = this.cell.neigh( 0, -1); if (!n.isEdgeCell()) { return this.world.spawn(MineExplosion, n); }
  }
}
MineExplosion.initClass();


//# Exports
module.exports = MineExplosion;

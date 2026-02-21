/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS206: Consider reworking classes to avoid initClass
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
const BoloObject = require('../object');


//# Flood fill

// An invisible object, which implements the slow but sure flooding when a crater or new tile of
// river is created.

class FloodFill extends BoloObject {
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
    return this.lifespan = 16;
  }

  anySpawn() {
    this.cell = this.world.map.cellAtWorld(this.x, this.y);
    return this.neighbours = [this.cell.neigh(1, 0), this.cell.neigh(0, 1), this.cell.neigh(-1, 0), this.cell.neigh(0, -1)];
  }

  update() {
    if (this.lifespan-- === 0) {
      this.flood();
      return this.world.destroy(this);
    }
  }

  canGetWet() {
    let result = false;
    for (var n of Array.from(this.neighbours)) {
      if (!(n.base || n.pill) && n.isType(' ', '^', 'b')) {
        result = true;
        break;
      }
    }
    return result;
  }

  flood() {
    if (this.canGetWet()) {
      this.cell.setType(' ', false);
      return this.spread();
    }
  }

  spread() {
    for (var n of Array.from(this.neighbours)) {
      if (!(n.base || n.pill) && n.isType('%')) {
        this.world.spawn(FloodFill, n);
      }
    }
  }
}
FloodFill.initClass();


//# Exports
module.exports = FloodFill;

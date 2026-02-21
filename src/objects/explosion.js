/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS206: Consider reworking classes to avoid initClass
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
// An explosion is really just a static animation.

const {floor}    = Math;
const BoloObject = require('../object');


class Explosion extends BoloObject {
  static initClass() {
  
    this.prototype.styled = false;
  }

  serialization(isCreate, p) {
    if (isCreate) {
      p('H', 'x');
      p('H', 'y');
    }

    return p('B', 'lifespan');
  }

  getTile() {
    switch (floor(this.lifespan / 3)) {
      case 7: return [20, 3];
      case 6: return [21, 3];
      case 5: return [20, 4];
      case 4: return [21, 4];
      case 3: return [20, 5];
      case 2: return [21, 5];
      case 1: return [18, 4];
      default: return [19, 4];
    }
  }

  //### World updates

  spawn(x, y) {
    this.x = x;
    this.y = y;
    return this.lifespan = 23;
  }

  update() {
    if (this.lifespan-- === 0) {
      return this.world.destroy(this);
    }
  }
}
Explosion.initClass();


//### Exports
module.exports = Explosion;

/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS202: Simplify dynamic range loops
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
//# World mixin

// Common logic between all bolo world classes.

const BoloWorldMixin = {

  //### Player management

  // If only we could extend constructors using mixins.
  boloInit() {
    return this.tanks = [];
  },

  addTank(tank) {
    tank.tank_idx = this.tanks.length;
    this.tanks.push(tank);
    if (this.authority) { return this.resolveMapObjectOwners(); }
  },

  removeTank(tank) {
    this.tanks.splice(tank.tank_idx, 1);
    for (let i = tank.tank_idx, end = this.tanks.length, asc = tank.tank_idx <= end; asc ? i < end : i > end; asc ? i++ : i--) {
      this.tanks[i].tank_idx = i;
    }
    if (this.authority) { return this.resolveMapObjectOwners(); }
  },

  //### Map helpers

  // A helper method which returns all map objects.
  getAllMapObjects() { return this.map.pills.concat(this.map.bases); },

  // The special spawning logic for MapObjects. These are created when the map is loaded, which is
  // before the World is created. We emulate `spawn` here for these objects.
  spawnMapObjects() {
    for (var obj of Array.from(this.getAllMapObjects())) {
      obj.world = this;
      this.insert(obj);
      obj.spawn();
      obj.anySpawn();
    }
  },

  // Resolve pillbox and base owner indices to the actual tanks. This method is only really useful
  // on the server. Because of the way serialization works, the client doesn't get the see invalid
  // owner indices. (As can be seen in `ServerWorld#serialize`.) It is called whenever a player
  // joins or leaves the game.
  resolveMapObjectOwners() {
    for (var obj of Array.from(this.getAllMapObjects())) {
      obj.ref('owner', this.tanks[obj.owner_idx]);
      if (obj.cell != null) {
        obj.cell.retile();
      }
    }
  }
};


//# Exports
module.exports = BoloWorldMixin;

/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS202: Simplify dynamic range loops
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
//# BaseWorld

// An instance of `World` represents the game world. It's a container that keeps track of everything
// happening in the game simulation. The `BaseWorld` class is the base class of the different kinds
// of `World`.
class BaseWorld {

  constructor() {
    this.objects = [];
  }

  //### Basic object management

  // Calling `tick` processes a single simulation step.
  tick() {
    for (var obj of Array.from(this.objects.slice(0))) {
      this.update(obj);
    }
  }

  // These are methods that allow low-level manipulation of the object list, while keeping it
  // properly sorted, and keeping object indices up-to-date. Unless you're doing something special,
  // you will want to use `spawn` and `destroy` instead.

  insert(obj) {
    // assert: obj.idx == null
    let i;
    let asc, end;
    for (i = 0; i < this.objects.length; i++) {
      var other = this.objects[i];
      if (obj.updatePriority > other.updatePriority) { break; }
    }
    this.objects.splice(i, 0, obj);
    for (i = i, end = this.objects.length, asc = i <= end; asc ? i < end : i > end; asc ? i++ : i--) {
      this.objects[i].idx = i;
    }
    return obj;
  }

  remove(obj) {
    // assert: obj.idx != null
    this.objects.splice(obj.idx, 1);
    for (let i = obj.idx, end = this.objects.length, asc = obj.idx <= end; asc ? i < end : i > end; asc ? i++ : i--) {
      this.objects[i].idx = i;
    }
    obj.idx = null;
    return obj;
  }

  //### Abstract methods

  // The `registerType` method registers a type of object with the world. It is usually called on
  // the prototype of the `World`.
  registerType(type) {}

  // An object is added to the world with `world.spawn(MyObject, params...);`. The first parameter
  // is the type of object to spawn, and further arguments will be passed to the `spawn` method of
  // the object itself.
  spawn(type, ...args) {}

  // With the `update` method, a single world object is updated and the proper events are emitted.
  // This is called in a loop from `tick`, which is what you usually want to call instead.
  update(obj) {}

  // To remove an object from the world, pass it to this `destroy` method.
  destroy(obj) {}
}


//# Exports

module.exports = BaseWorld;

const BaseWorld = require('./base');


//# LocalWorld

// The `World` for games that run only on the local machine is the simplest implementation.
// See `BaseWorld` for more detail on what a `World` provides.
class LocalWorld extends BaseWorld {

  spawn(type, ...args) {
    const obj = this.insert(new type(this));
    obj.spawn(...Array.from(args || []));
    return obj;
  }

  update(obj) {
    obj.update();
    obj.emit('update');
    return obj;
  }

  destroy(obj) {
    obj.destroy();
    obj.emit('destroy');
    obj.emit('finalize');
    this.remove(obj);
    return obj;
  }
}


//# Exports

module.exports = LocalWorld;

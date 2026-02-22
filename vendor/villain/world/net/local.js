/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
const BaseWorld = require('../base');


//# NetLocalWorld

// Similar to `LocalWorld`, but it emits more signals, so that games built around networking can
// also depend on a local world getting the same signals.
class NetLocalWorld extends BaseWorld {

  spawn(type, ...args) {
    const obj = this.insert(new type(this));
    obj.spawn(...Array.from(args || []));
    obj.anySpawn();
    return obj;
  }

  update(obj) {
    obj.update();
    obj.emit('update');
    obj.emit('anyUpdate');
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

module.exports = NetLocalWorld;

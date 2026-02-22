/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
const BaseWorld = require('../base');
const {pack, buildPacker} = require('../../struct');


//# ServerWorld

// The `World` implementation on the server runs the authoritative simulation and prepares state
// updates that can be transmitted to clients.
class ServerWorld extends BaseWorld {

  // The server transmits character code identifiers for object types. We cache the byte value of
  // these characters using the `registerType` prototype method.

  registerType(type) {
    if (!this.hasOwnProperty('typeIdxCounter')) { this.typeIdxCounter = 0; }
    return type.prototype._net_type_idx = this.typeIdxCounter++;
  }

  // The following are implementations of abstract `BaseWorld` methods for the server. Any
  // world simulation done on the server needs to be kept track of, so that the changes may be
  // transmitted to clients.

  constructor() {
    super(...arguments);
    this.changes = [];
  }

  spawn(type, ...args) {
    // assert: type::_net_type_idx != undefined
    const obj = this.insert(new type(this));
    this.changes.push(['create', obj, obj.idx]);
    obj._net_new = true;
    obj.spawn(...Array.from(args || []));
    obj.anySpawn();
    return obj;
  }

  update(obj) {
    obj.update();
    obj.emit('update');
    return obj.emit('anyUpdate');
  }

  destroy(obj) {
    this.changes.push(['destroy', obj, obj.idx]);
    this.remove(obj);
    obj.destroy();
    obj.emit('destroy');
    obj.emit('finalize');
    return obj;
  }

  //### Object synchronization

  // Serializes an object's state into a data block to be sent to clients. The optional `isInitial`
  // flag should be set to force the `isCreate` flag to true in the `serialization` method. This is
  // useful when sending an initial update to clients.
  dump(obj, isInitial) {
    // assert: not (isInitial and obj._net_new)
    const isCreate = isInitial || obj._net_new;
    obj._net_new = false;
    return this.serialize(obj, isCreate);
  }

  // Serializes all objects' state into one large data block. This is used to send complete updates
  // for a single game tick, or the initial state packet.
  dumpTick(isInitial) {
    let data = [];
    for (var obj of Array.from(this.objects)) {
      data = data.concat(this.dump(obj, isInitial));
    }
    return data;
  }

  // The `serialize` helper builds the generator used for serialization and passes it to the
  // `serialization` method of `object`. It wraps `struct.packer` with the function signature
  // that we want, and also adds the necessary support to process the `O` format specifier.
  serialize(obj, isCreate) {
    const packer = buildPacker();
    obj.serialization(isCreate, function(specifier, attribute, options) {
      if (!options) { options = {}; }
      let value = obj[attribute];
      if (options.tx != null) { value = options.tx(value); }
      if (specifier === 'O') {
        packer('H', value ? value.$.idx : 65535);
      } else {
        packer(specifier, value);
      }
    });
    return packer.finish();
  }
}


//# Exports

module.exports = ServerWorld;

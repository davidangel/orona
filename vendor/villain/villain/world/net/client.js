/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS201: Simplify complex destructure assignments
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
const BaseWorld = require('../base');
const {unpack, buildUnpacker} = require('../../struct');


//# ClientWorld

// The `World` implementation on the client runs both a local simulation and handles synchronization
// with the world state living on the server.
class ClientWorld extends BaseWorld {

  // The client receives character code identifiers for object types. In order to find the object
  // type belonging to a code, a registry is needed.

  registerType(type) {
    if (!this.hasOwnProperty('types')) { this.types = []; }
    return this.types.push(type);
  }

  // The following are implementations of abstract `BaseWorld` methods for the client. Any
  // world simulation done on the client is only to make the game appear smooth at low latencies
  // or network interruptions. The client thus has to keep track of changes it makes, so that it
  // can always return to a state where it is synchronized with the server.

  constructor() {
    super(...arguments);
    this.changes = [];
  }

  spawn(type, ...args) {
    const obj = this.insert(new type(this));
    this.changes.unshift(['create', obj.idx, obj]);
    obj._net_transient = true;
    obj.spawn(...Array.from(args || []));
    obj.anySpawn();
    return obj;
  }

  update(obj) {
    // assert: !obj._net_new
    obj.update();
    obj.emit('update');
    obj.emit('anyUpdate');
    return obj;
  }

  destroy(obj) {
    this.changes.unshift(['destroy', obj.idx, obj]);
    this.remove(obj);
    obj.emit('destroy');
    if (obj._net_transient) { obj.emit('finalize'); }
    return obj;
  }

  //### Object synchronization

  // These methods are responsible for performing the synchronization based on messages received
  // from the server. When processing messages, networking calls the `netSpawn`, `netTick` and
  // `netDestroy` methods. Each of these take the raw message data, process it, then return the
  // number of bytes they used.

  // Before newly received messages are processed, `netRestore()` is called. This method takes care
  // of reverting any local changes that were made on the client.
  netRestore() {
    let type;
    let idx, obj;
    if (!(this.changes.length > 0)) { return; }
    for ([type, idx, obj] of Array.from(this.changes)) {
      switch (type) {
        case 'create':
          if (obj.transient && !obj._net_revived) { obj.emit('finalize'); }
          this.objects.splice(idx, 1);
          break;
        case 'destroy':
          obj._net_revived = true;
          this.objects.splice(idx, 0, obj);
          break;
      }
    }
    this.changes = [];
    for (let i = 0; i < this.objects.length; i++) {
      obj = this.objects[i];
      obj.idx = i;
    }
  }

  // Networking code adds objects to the network using `netSpawn`. This method creates the object,
  // but leaves it bare-bones otherwise. State for the new object is received in the upcoming
  // update message, at which point events are emitted.
  netSpawn(data, offset) {
    const type = this.types[data[offset]];
    // assert: type != undefined
    const obj = this.insert(new type(this));
    obj._net_transient = false;
    obj._net_new = true;
    return 1;
  }

  // The `netUpdate` method asks a single object to deserialize state from the given data, and emits
  // the proper events. This is called in a loop from `netTick`, which is what you usually want to
  // call instead.
  netUpdate(obj, data, offset) {
    const [bytes, changes] = Array.from(this.deserialize(obj, data, offset, obj._net_new));
    if (obj._net_new) {
      obj.netSpawn();
      obj.anySpawn();
      obj._net_new = false;
    } else {
      obj.emit('netUpdate', changes);
      obj.emit('anyUpdate');
    }
    obj.emit('netSync');
    return bytes;
  }

  // Networking code can remove objects from the world with the `netDestroy` method.
  netDestroy(data, offset) {
    const array = unpack('H', data, offset), [obj_idx] = Array.from(array[0]), bytes = array[1];
    const obj = this.objects[obj_idx];
    if (!obj._net_new) {
      obj.emit('netDestroy');
      obj.emit('anyDestroy');
      obj.emit('finalize');
    }
    this.remove(obj);
    return bytes;
  }

  // A complete update of state for all objects is passed to `netTick`. It is assumed at this point
  // that the object list on the server and client are the same. Thus, this method expects a stream
  // of serialized object state, which it walks through, calling `netUpdate` for each object and
  // the relevant chunk of data from the stream.
  netTick(data, offset) {
    let bytes = 0;
    for (var obj of Array.from(this.objects)) {
      bytes += this.netUpdate(obj, data, offset + bytes);
    }
    return bytes;
  }

  // The `deserialize` helper builds the generator used for deserialization and passes it to the
  // `serialization` method of `object`. It wraps `struct.unpacker` with the function signature
  // that we want, and also adds the necessary support to process the `O` format specifier.
  deserialize(obj, data, offset, isCreate) {
    const unpacker = buildUnpacker(data, offset);
    const changes = {};
    obj.serialization(isCreate, (specifier, attribute, options) => {
      let oldValue;
      if (!options) { options = {}; }
      if (specifier === 'O') {
        const other = this.objects[unpacker('H')];
        if ((oldValue = obj[attribute] != null ? obj[attribute].$ : undefined) !== other) {
          changes[attribute] = oldValue;
          obj.ref(attribute, other);
        }
      } else {
        let value = unpacker(specifier);
        if (options.rx != null) { value = options.rx(value); }
        if ((oldValue = obj[attribute]) !== value) {
          changes[attribute] = oldValue;
          obj[attribute] = value;
        }
      }
    });
    return [unpacker.finish(), changes];
  }
}


//# Exports
module.exports = ClientWorld;

/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS205: Consider reworking code to avoid use of IIFEs
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
// Functions that provide functionality somewhat like Python's `struct` module: packing and
// unpacking a bunch of values to and from binary data.
//
// The main differences with Python are that this version is far less featureful, of course, but
// also that this version is built for streaming, using a generator pattern. This allows the caller
// to make decisions mid-stream about the data that's going to follow.
//
// Because there's no standard way for dealing with binary data in JavaScript (yet), these functions
// deal with arrays of byte values instead.


//# Helpers

// The following methods pack numbers in an array of bytes, in network byte order.

const toUint8  = n => [
    n & 0xFF
  ];

const toUint16 = n => [
    (n & 0xFF00) >> 8,
     n & 0x00FF
  ];

const toUint32 = n => [
    (n & 0xFF000000) >> 24,
    (n & 0x00FF0000) >> 16,
    (n & 0x0000FF00) >> 8,
     n & 0x000000FF
  ];

// And the reverse of the above. Each takes an array of bytes, and an offset.

const fromUint8  = (d, o) => d[o];
const fromUint16 = (d, o) => (d[o] << 8) + d[o+1];
const fromUint32 = (d, o) => (d[o] << 24) + (d[o+1] << 16) + (d[o+2] << 8) + d[o+3];


//# Streaming packers

// Return a generator function, that is used to generate binary data. Basic usage is as follows:
//
//     packer = buildPacker()
//     packer('B', myByteValue)
//     packer('H', myShortValue)
//     packer('f', myBooleanValue)
//     packer('f', mySecondBooleanValue)
//     data = packer.finish()
//
// The format characters match those of Python's `struct`. However, only a subset is supported,
// namely `B`, `H`, and `I`. In addition to these, there's also a way to tightly pack bit fields,
// simply by using the `f` format character in repetition. The caller should take care to group
// bit fields, though.
const buildPacker = function() {
  let data = [];

  let bits = null;
  let bitIndex = 0;
  const flushBitFields = function() {
    if (bits === null) { return; }
    data.push(bits);
    return bits = null;
  };

  const retval = function(type, value) {
    if (type === 'f') {
      if (bits === null) {
        bits = !!value ? 1 : 0;
        return bitIndex = 1;
      } else {
        if (!!value) { bits |= 1 << bitIndex; }
        bitIndex++;
        if (bitIndex === 8) { return flushBitFields(); }
      }
    } else {
      flushBitFields();
      return data = data.concat((() => { switch (type) {
        case 'B': return toUint8(value);
        case 'H': return toUint16(value);
        case 'I': return toUint32(value);
        default: throw new Error(`Unknown format character ${type}`);
      
      } })());
    }
  };

  retval.finish = function() {
    flushBitFields();
    return data;
  };

  return retval;
};

// The opposite of the above. Takes an array of bytes and an optional offset, and returns a
// generator which can be repeatedly called to get values from the input data. For example:
//
//     unpacker = buildUnpacker()
//     myByteValue = unpacker('B')
//     myShortValue = unpacker('H')
//     myBooleanValue = unpacker('f')
//     mySecondBooleanValue = unpacker('f')
//     bytesTaken = unpacker.finish()
const buildUnpacker = function(data, offset) {
  if (!offset) { offset = 0; }
  let idx = offset;

  let bitIndex = 0;

  const retval = function(type) {
    let value;
    if (type === 'f') {
      const bit = (1 << bitIndex) & data[idx];
      value = bit > 0;
      bitIndex++;
      if (bitIndex === 8) {
        idx++;
        bitIndex = 0;
      }
    } else {
      let bytes;
      if (bitIndex !== 0) {
        idx++;
        bitIndex = 0;
      }
      [value, bytes] = Array.from((() => { switch (type) {
        case 'B': return [ fromUint8(data, idx), 1];
        case 'H': return [fromUint16(data, idx), 2];
        case 'I': return [fromUint32(data, idx), 4];
        default: throw new Error(`Unknown format character ${type}`);
      } })());
      idx += bytes;
    }
    return value;
  };

  retval.finish = function() {
    if (bitIndex !== 0) { idx++; }
    return idx - offset;
  };

  return retval;
};


//# Non-streaming packers

// These work more like Python's `struct`.

// The `pack` function takes a format string, and the respective values as its arguments. It then
// returns the binary data as an array of byte values.
const pack = function(fmt) {
  const packer = buildPacker();
  for (let i = 0; i < fmt.length; i++) {
    var type = fmt[i];
    var value = arguments[i+1];
    packer(type, value);
  }
  return packer.finish();
};

// The `unpack` function takes a format string, an array of bytes and an optional offset. The return
// value is a pair containing an array of the unpacked values, and the number of bytes taken.
const unpack = function(fmt, data, offset) {
  const unpacker = buildUnpacker(data, offset);
  const values = Array.from(fmt).map((type) => unpacker(type));
  return [values, unpacker.finish()];
};


//# Exports

exports.buildPacker = buildPacker;
exports.buildUnpacker = buildUnpacker;
exports.pack = pack;
exports.unpack = unpack;

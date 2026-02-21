/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
const {sqrt, atan2} = Math;


// Extend a source object with the properties of another object (shallow copy).
// We use this to simulate Node's deprecated `process.mixin`.
const extend = (exports.extend = function(object, properties) {
  for (var key in properties) {
    var val = properties[key];
    object[key] = val;
  }
  return object;
});

// Calculate the distance between two objects.
const distance = (exports.distance = function(a, b) {
  const dx = a.x - b.x; const dy = a.y - b.y;
  return sqrt((dx*dx) + (dy*dy));
});

// Calculate the heading from `a` towards `b` in radians.
const heading = (exports.heading = (a, b) => atan2(b.y - a.y, b.x - a.x));

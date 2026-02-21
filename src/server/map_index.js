/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
const fs   = require('fs');
const path = require('path');


class MapIndex {
  constructor(mapPath, callback) {
    this.mapPath = mapPath;
    this.reindex(callback);
  }

  reindex(callback) {
    let fuzzy, names;
    this.nameIndex = (names = {});
    this.fuzzyIndex = (fuzzy = {});

    var index = (file, callback) => fs.stat(file, function(err, stats) {
      let m;
      if (err) {
        console.log(err.toString());
        return (typeof callback === 'function' ? callback() : undefined);
      }
      if (stats.isDirectory()) {
        return fs.readdir(file, function(err, subfiles) {
          if (err) {
            console.log(err.toString());
            return (typeof callback === 'function' ? callback() : undefined);
          }
          let counter = subfiles.length;
          return Array.from(subfiles).map((subfile) =>
            index(path.join(file, subfile), function() {
              if (--counter === 0) { return (typeof callback === 'function' ? callback() : undefined); }
            }));
        });
      } else if (m = /([^/]+?)\.map$/i.exec(file)) {
        const descr = { name: m[1], path: file };
        names[descr.name] = (fuzzy[descr.name.replace(/[\W_]+/g, '')] = descr);
        return (typeof callback === 'function' ? callback() : undefined);
      } else {
        return (typeof callback === 'function' ? callback() : undefined);
      }
    });

    index(this.mapPath, callback);
  }

  get(name) {
    return this.nameIndex[name];
  }

  fuzzy(s) {
    const input = s.replace(/[\W_]+/g, '');
    const matcher = new RegExp(input, 'i');
    const results = [];
    for (var fuzzed in this.fuzzyIndex) {
      var descr = this.fuzzyIndex[fuzzed];
      if (fuzzed === input) {
        return [descr];
      } else if (matcher.test(fuzzed)) {
        results.push(descr);
      }
    }
    return results;
  }
}


//# Exports
module.exports = MapIndex;

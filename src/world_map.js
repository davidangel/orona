/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
// This module extends the classes defined in the `map` module, and provides the logic, data and
// hooks that are needed for a full game.


const {round, random,
 floor}              = Math;
const {TILE_SIZE_WORLD,
 TILE_SIZE_PIXELS}   = require('./constants');
const {Map, TERRAIN_TYPES} = require('./map');
const net                  = require('./net');
const sounds               = require('./sounds');
const WorldPillbox         = require('./objects/world_pillbox');
const WorldBase            = require('./objects/world_base');
const FloodFill            = require('./objects/flood_fill');


//# Terrain data

// Extend `TERRAIN_TYPES` with additional attributes that matter to the game.

const TERRAIN_TYPE_ATTRIBUTES = {
  '|': { tankSpeed:  0, tankTurn: 0.00, manSpeed:  0 },
  ' ': { tankSpeed:  3, tankTurn: 0.25, manSpeed:  0 },
  '~': { tankSpeed:  3, tankTurn: 0.25, manSpeed:  4 },
  '%': { tankSpeed:  3, tankTurn: 0.25, manSpeed:  4 },
  '=': { tankSpeed: 16, tankTurn: 1.00, manSpeed: 16 },
  '#': { tankSpeed:  6, tankTurn: 0.50, manSpeed:  8 },
  ':': { tankSpeed:  3, tankTurn: 0.25, manSpeed:  4 },
  '.': { tankSpeed: 12, tankTurn: 1.00, manSpeed: 16 },
  '}': { tankSpeed:  0, tankTurn: 0.00, manSpeed:  0 },
  'b': { tankSpeed: 16, tankTurn: 1.00, manSpeed: 16 },
  '^': { tankSpeed:  3, tankTurn: 0.50, manSpeed:  0 }
};

const extendTerrainMap = () => (() => {
  const result = [];
  for (var ascii in TERRAIN_TYPE_ATTRIBUTES) {
    var attributes = TERRAIN_TYPE_ATTRIBUTES[ascii];
    var type = TERRAIN_TYPES[ascii];
    result.push((() => {
      const result1 = [];
      for (var key in attributes) {
        var value = attributes[key];
        result1.push(type[key] = value);
      }
      return result1;
    })());
  }
  return result;
})();

extendTerrainMap();


//# Cell class

class WorldMapCell extends Map.prototype.CellClass {

  constructor(map, x, y) {
    super(...arguments);
    this.life = 0;
  }

  isObstacle() { return ((this.pill != null ? this.pill.armour : undefined) > 0) || (this.type.tankSpeed === 0); }

  // Does this cell contain a tank with a boat?
  hasTankOnBoat() {
    for (var tank of Array.from(this.map.world.tanks)) {
      if ((tank.armour !== 255) && (tank.cell === this)) {
        if (tank.onBoat) { return true; }
      }
    }
    return false;
  }

  getTankSpeed(tank) {
    // Check for a pillbox.
    if ((this.pill != null ? this.pill.armour : undefined) > 0) { return 0; }
    // Check for an enemy base.
    if (this.base != null ? this.base.owner : undefined) {
      if (!this.base.owner.$.isAlly(tank) && !(this.base.armour <= 9)) { return 0; }
    }
    // Check if we're on a boat.
    if (tank.onBoat && this.isType('^', ' ')) { return 16; }
    // Take the land speed.
    return this.type.tankSpeed;
  }

  getTankTurn(tank) {
    // Check for a pillbox.
    if ((this.pill != null ? this.pill.armour : undefined) > 0) { return 0.00; }
    // Check for an enemy base.
    if (this.base != null ? this.base.owner : undefined) {
      if (!this.base.owner.$.isAlly(tank) && !(this.base.armour <= 9)) { return 0.00; }
    }
    // Check if we're on a boat.
    if (tank.onBoat && this.isType('^', ' ')) { return 1.00; }
    // Take the land turn speed.
    return this.type.tankTurn;
  }

  getManSpeed(man) {
    const tank = man.owner.$;
    // Check for a pillbox.
    if ((this.pill != null ? this.pill.armour : undefined) > 0) { return 0; }
    // Check for an enemy base.
    if ((this.base != null ? this.base.owner : undefined) != null) {
      if (!this.base.owner.$.isAlly(tank) && !(this.base.armour <= 9)) { return 0; }
    }
    // Take the land speed.
    return this.type.manSpeed;
  }

  getPixelCoordinates() { return [(this.x + 0.5) * TILE_SIZE_PIXELS, (this.y + 0.5) * TILE_SIZE_PIXELS]; }
  getWorldCoordinates() { return [(this.x + 0.5) * TILE_SIZE_WORLD,  (this.y + 0.5) * TILE_SIZE_WORLD ]; }

  setType(newType, mine, retileRadius) {
    const [oldType, hadMine, oldLife] = Array.from([this.type, this.mine, this.life]);
    super.setType(...arguments);
    this.life = (() => { switch (this.type.ascii) {
      case '.': return 5;
      case '}': return 5;
      case ':': return 5;
      case '~': return 4;
      default: return 0;
    } })();
    return (this.map.world != null ? this.map.world.mapChanged(this, oldType, hadMine, oldLife) : undefined);
  }

  takeShellHit(shell) {
    // FIXME: check for a mine
    let nextType;
    let sfx = sounds.SHOT_BUILDING;
    if (this.isType('.', '}', ':', '~')) {
      if (--this.life === 0) {
        nextType = (() => { switch (this.type.ascii) {
          case '.': return '~';
          case '}': return ':';
          case ':': return ' ';
          case '~': return ' ';
        } })();
        this.setType(nextType);
      } else {
        if (this.map.world != null) {
          this.map.world.mapChanged(this, this.type, this.mine);
        }
      }
    } else if (this.isType('#')) {
      this.setType('.');
      sfx = sounds.SHOT_TREE;
    } else if (this.isType('=')) {
      const neigh =
        (shell.direction >= 224)  || (shell.direction <  32) ? this.neigh( 1,  0)
        : (shell.direction >=  32) && (shell.direction <  96) ? this.neigh( 0, -1)
        : (shell.direction >=  96) && (shell.direction < 160) ? this.neigh(-1,  0)
        : this.neigh(0, 1);
      if (neigh.isType(' ', '^')) { this.setType(' '); }
    } else {
      nextType = (() => { switch (this.type.ascii) {
        case '|': return '}';
        case 'b': return ' ';
      } })();
      this.setType(nextType);
    }
    if (this.isType(' ')) { if (this.map.world != null) {
      this.map.world.spawn(FloodFill, this);
    } }
    return sfx;
  }

  takeExplosionHit() {
    if (this.pill != null) { return this.pill.takeExplosionHit(); }
    if (this.isType('b')) { this.setType(' ');
    } else if (!this.isType(' ', '^', 'b')) { this.setType('%');
    } else { return; }
    return (this.map.world != null ? this.map.world.spawn(FloodFill, this) : undefined);
  }
}


//# Map class

class WorldMap extends Map {
  static initClass() {
  
    this.prototype.CellClass = WorldMapCell;
    this.prototype.PillboxClass = WorldPillbox;
    this.prototype.BaseClass = WorldBase;
  }

  // Get the cell at the given pixel coordinates, or return a dummy cell.
  cellAtPixel(x, y) {
    return this.cellAtTile(floor(x / TILE_SIZE_PIXELS), floor(y / TILE_SIZE_PIXELS));
  }

  // Get the cell at the given world coordinates, or return a dummy cell.
  cellAtWorld(x, y) {
    return this.cellAtTile(floor(x / TILE_SIZE_WORLD), floor(y / TILE_SIZE_WORLD));
  }

  getRandomStart() {
    return this.starts[round(random() * (this.starts.length - 1))];
  }
}
WorldMap.initClass();


//# Exports
module.exports = WorldMap;

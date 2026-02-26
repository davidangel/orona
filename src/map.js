/*
 * decaffeinate suggestions:
 * DS002: Fix invalid constructor
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS202: Simplify dynamic range loops
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
// This module contains everything needed to read, manipulate and save the BMAP format for Bolo
// maps. It's the same format that's used by the original Bolo and WinBolo. This is one of the few
// modules that is useful on it's own.


const {round, floor, min} = Math;
const {MAP_SIZE_TILES} = require('./constants');


// All the different terrain types we know about, indexed both by the numeric ID used in the
// binary BMAP format, as well as by ASCII code we use here in Orona.
const TERRAIN_TYPES = [
  { ascii: '|', description: 'building'        },
  { ascii: ' ', description: 'river'           },
  { ascii: '~', description: 'swamp'           },
  { ascii: '%', description: 'crater'          },
  { ascii: '=', description: 'road'            },
  { ascii: '#', description: 'forest'          },
  { ascii: ':', description: 'rubble'          },
  { ascii: '.', description: 'grass'           },
  { ascii: '}', description: 'shot building'   },
  { ascii: 'b', description: 'river with boat' },
  { ascii: '^', description: 'deep sea'        }
];

const createTerrainMap = () => Array.from(TERRAIN_TYPES).map((type) =>
  (TERRAIN_TYPES[type.ascii] = type));

createTerrainMap();


//### Cell class

class MapCell {
  constructor(map, x, y) {
    this.map = map;
    this.x = x;
    this.y = y;
    this.type = TERRAIN_TYPES['^'];
    this.mine = this.isEdgeCell();
    this.mineOwner = 255;

    // This is just a unique index for this cell; used in a couple of places for convenience.
    this.idx = (this.y * MAP_SIZE_TILES) + this.x;
  }

  // Get the cell at offset +dx+,+dy+ from this cell.
  // Most commonly used to get one of the neighbouring cells.
  // Will return a dummy deep sea cell if the location is off the map.
  neigh(dx, dy) {
    return this.map.cellAtTile(this.x + dx, this.y + dy);
  }

  // Check whether the cell is one of the give types.
  // The splat variant is significantly slower
  //isType: (types...) ->
  //  for type in types
  //    return yes if @type == type or @type.ascii == type
  //  no
  isType() {
    for (let i = 0, end = arguments.length, asc = 0 <= end; asc ? i <= end : i >= end; asc ? i++ : i--) {
      var type = arguments[i];
      if ((this.type === type) || (this.type.ascii === type)) { return true; }
    }
    return false;
  }

  isEdgeCell() {
    return (this.x <= 20) || (this.x >= 236) || (this.y <= 20) || (this.y >= 236);
  }

  getNumericType() {
    if (this.type.ascii === '^') { return -1; }
    let num = TERRAIN_TYPES.indexOf(this.type);
    if (this.mine) { num += 8; }
    return num;
  }

  setType(newType, mine, retileRadius) {
    if (!retileRadius) { retileRadius = 1; }

    const oldType = this.type;
    const hadMine = this.mine;

    if (mine !== undefined) { this.mine = mine; }
    if (typeof(newType) === 'string') {
      this.type = TERRAIN_TYPES[newType];
      if ((newType.length !== 1) || (this.type == null)) {
        throw `Invalid terrain type: ${newType}`;
      }
    } else if (typeof(newType) === 'number') {
      if (newType >= 10) {
        newType -= 8;
        this.mine = true;
      } else {
        this.mine = false;
      }
      this.type = TERRAIN_TYPES[newType];
      if ((this.type == null)) {
        throw `Invalid terrain type: ${newType}`;
      }
    } else if (newType !== null) {
      this.type = newType;
    }

    if (this.isEdgeCell()) { this.mine = true; }

    if (!(retileRadius < 0)) { return this.map.retile(
      this.x - retileRadius, this.y - retileRadius,
      this.x + retileRadius, this.y + retileRadius
    ); }
  }

  // Helper for retile methods. Short-hand for notifying the view of a retile.
  // Also takes care of drawing mines.
  setTile(tx, ty) {
    if (this.mine && !((this.pill != null) || (this.base != null))) { ty += 10; }
    return this.map.view.onRetile(this, tx, ty);
  }

  // Retile this cell. See map#retile.
  retile() {
    if (this.pill != null) {
      return this.setTile(this.pill.armour, 2);
    } else if (this.base != null) {
      return this.setTile(16, 0);
    } else {
      switch (this.type.ascii) {
        case '^': return this.retileDeepSea();
        case '|': return this.retileBuilding();
        case ' ': return this.retileRiver();
        case '~': return this.setTile(7, 1);
        case '%': return this.setTile(5, 1);
        case '=': return this.retileRoad();
        case '#': return this.retileForest();
        case ':': return this.setTile(4, 1);
        case '.': return this.setTile(2, 1);
        case '}': return this.setTile(8, 1);
        case 'b': return this.retileBoat();
      }
    }
  }

  retileDeepSea() {
    // We only care if our neighbours are deep sea, water or land.
    const neighbourSignificance = (dx, dy) => {
      const n = this.neigh(dx, dy);
      if (n.isType('^')) { return 'd'; }
      if (n.isType(' ', 'b')) { return 'w'; }
      return 'l';
    };

    const above      = neighbourSignificance( 0, -1);
    const aboveRight = neighbourSignificance( 1, -1);
    const right      = neighbourSignificance( 1,  0);
    const belowRight = neighbourSignificance( 1,  1);
    const below      = neighbourSignificance( 0,  1);
    const belowLeft  = neighbourSignificance(-1,  1);
    const left       = neighbourSignificance(-1,  0);
    const aboveLeft  = neighbourSignificance(-1, -1);

    if      ((aboveLeft  !== 'd') && (above !== 'd') && (left  !== 'd') && (right === 'd') && (below === 'd')) { return this.setTile(10, 3);
    } else if ((aboveRight !== 'd') && (above !== 'd') && (right !== 'd') && (left  === 'd') && (below === 'd')) { return this.setTile(11, 3);
    } else if ((belowRight !== 'd') && (below !== 'd') && (right !== 'd') && (left  === 'd') && (above === 'd')) { return this.setTile(13, 3);
    } else if ((belowLeft  !== 'd') && (below !== 'd') && (left  !== 'd') && (right === 'd') && (above === 'd')) { return this.setTile(12, 3);

    } else if ((left  === 'w') && (right === 'd')) { return this.setTile(14, 3);
    } else if ((below === 'w') && (above === 'd')) { return this.setTile(15, 3);
    } else if ((above === 'w') && (below === 'd')) { return this.setTile(16, 3);
    } else if ((right === 'w') && (left  === 'd')) { return this.setTile(17, 3);

    } else { return this.setTile(0, 0); }
  }

  retileBuilding() {
    // We only care if our neighbours are buildings or not.
    const neighbourSignificance = (dx, dy) => {
      const n = this.neigh(dx, dy);
      if (n.isType('|', '}')) { return 'b'; }
      return 'o';
    };

    const above      = neighbourSignificance( 0, -1);
    const aboveRight = neighbourSignificance( 1, -1);
    const right      = neighbourSignificance( 1,  0);
    const belowRight = neighbourSignificance( 1,  1);
    const below      = neighbourSignificance( 0,  1);
    const belowLeft  = neighbourSignificance(-1,  1);
    const left       = neighbourSignificance(-1,  0);
    const aboveLeft  = neighbourSignificance(-1, -1);

    if ((aboveLeft === 'b') && (above === 'b') && (aboveRight === 'b') && (left === 'b') && (right === 'b') && (belowLeft === 'b') && (below === 'b') && (belowRight === 'b')) { return this.setTile(17, 1);
    } else if ((right === 'b') && (above === 'b') && (below === 'b') && (left === 'b') && (aboveRight !== 'b') && (aboveLeft !== 'b') && (belowRight !== 'b') && (belowLeft !== 'b')) { return this.setTile(30, 1);
    } else if ((right === 'b') && (above === 'b') && (below === 'b') && (left === 'b') && (aboveRight !== 'b') && (aboveLeft !== 'b') && (belowRight !== 'b') && (belowLeft === 'b')) { return this.setTile(22, 2);
    } else if ((right === 'b') && (above === 'b') && (below === 'b') && (left === 'b') && (aboveRight !== 'b') && (aboveLeft === 'b') && (belowRight !== 'b') && (belowLeft !== 'b')) { return this.setTile(23, 2);
    } else if ((right === 'b') && (above === 'b') && (below === 'b') && (left === 'b') && (aboveRight !== 'b') && (aboveLeft !== 'b') && (belowRight === 'b') && (belowLeft !== 'b')) { return this.setTile(24, 2);
    } else if ((right === 'b') && (above === 'b') && (below === 'b') && (left === 'b') && (aboveRight === 'b') && (aboveLeft !== 'b') && (belowRight !== 'b') && (belowLeft !== 'b')) { return this.setTile(25, 2);

    } else if ((aboveLeft === 'b') && (above === 'b') && (left === 'b') && (right === 'b') && (belowLeft === 'b') && (below === 'b') && (belowRight === 'b')) { return this.setTile(16, 2);
    } else if ((above === 'b') && (aboveRight === 'b') && (left === 'b') && (right === 'b') && (belowLeft === 'b') && (below === 'b') && (belowRight === 'b')) { return this.setTile(17, 2);
    } else if ((aboveLeft === 'b') && (above === 'b') && (aboveRight === 'b') && (left === 'b') && (right === 'b') && (belowLeft === 'b') && (below === 'b')) { return this.setTile(18, 2);
    } else if ((aboveLeft === 'b') && (above === 'b') && (aboveRight === 'b') && (left === 'b') && (right === 'b') && (below === 'b') && (belowRight === 'b')) { return this.setTile(19, 2);

    } else if ((left === 'b') && (right === 'b') && (above === 'b') && (below === 'b') && (aboveRight === 'b') && (belowLeft === 'b') && (aboveLeft  !== 'b') && (belowRight !== 'b')) { return this.setTile(20, 2);
    } else if ((left === 'b') && (right === 'b') && (above === 'b') && (below === 'b') && (belowRight === 'b') && (aboveLeft === 'b') && (aboveRight !== 'b') && (belowLeft  !== 'b')) { return this.setTile(21, 2);

    } else if ((above === 'b') && (left === 'b') && (right === 'b') && (below === 'b') && (belowRight === 'b') && (aboveRight === 'b')) { return this.setTile(8, 2);
    } else if ((above === 'b') && (left === 'b') && (right === 'b') && (below === 'b') && (belowLeft  === 'b') && (aboveLeft  === 'b')) { return this.setTile(9, 2);
    } else if ((above === 'b') && (left === 'b') && (right === 'b') && (below === 'b') && (belowLeft  === 'b') && (belowRight === 'b')) { return this.setTile(10, 2);
    } else if ((above === 'b') && (left === 'b') && (right === 'b') && (below === 'b') && (aboveLeft  === 'b') && (aboveRight === 'b')) { return this.setTile(11, 2);

    } else if ((above === 'b') && (below === 'b') && (left  === 'b') && (right      !== 'b') && (belowLeft  === 'b') && (aboveLeft  !== 'b')) { return this.setTile(12, 2);
    } else if ((above === 'b') && (below === 'b') && (right === 'b') && (belowRight === 'b') && (left       !== 'b') && (aboveRight !== 'b')) { return this.setTile(13, 2);
    } else if ((above === 'b') && (below === 'b') && (right === 'b') && (aboveRight === 'b') && (belowRight !== 'b')) { return this.setTile(14, 2);
    } else if ((above === 'b') && (below === 'b') && (left  === 'b') && (aboveLeft  === 'b') && (belowLeft  !== 'b')) { return this.setTile(15, 2);

    } else if ((right === 'b') && (above === 'b') && (left  === 'b') && (below      !== 'b') && (aboveLeft  !== 'b') && (aboveRight !== 'b')) { return this.setTile(26, 1);
    } else if ((right === 'b') && (below === 'b') && (left  === 'b') && (belowLeft  !== 'b') && (belowRight !== 'b')) { return this.setTile(27, 1);
    } else if ((right === 'b') && (above === 'b') && (below === 'b') && (aboveRight !== 'b') && (belowRight !== 'b')) { return this.setTile(28, 1);
    } else if ((below === 'b') && (above === 'b') && (left  === 'b') && (aboveLeft  !== 'b') && (belowLeft  !== 'b')) { return this.setTile(29, 1);

    } else if ((left === 'b') && (right === 'b') && (above === 'b') && (aboveRight === 'b') && (aboveLeft  !== 'b')) { return this.setTile(4, 2);
    } else if ((left === 'b') && (right === 'b') && (above === 'b') && (aboveLeft  === 'b') && (aboveRight !== 'b')) { return this.setTile(5, 2);
    } else if ((left === 'b') && (right === 'b') && (below === 'b') && (belowLeft  === 'b') && (belowRight !== 'b')) { return this.setTile(6, 2);
    } else if ((left === 'b') && (right === 'b') && (below === 'b') && (above      !== 'b') && (belowRight === 'b') && (belowLeft !== 'b')) { return this.setTile(7, 2);

    } else if ((right === 'b') && (above === 'b') && (below === 'b')) { return this.setTile(0, 2);
    } else if ((left  === 'b') && (above === 'b') && (below === 'b')) { return this.setTile(1, 2);
    } else if ((right === 'b') && (left  === 'b') && (below === 'b')) { return this.setTile(2, 2);

    } else if ((right === 'b') && (above === 'b') && (left === 'b')) { return this.setTile(3, 2);
    } else if ((right === 'b') && (below === 'b') && (belowRight === 'b')) { return this.setTile(18, 1);
    } else if ((left  === 'b') && (below === 'b') && (belowLeft  === 'b')) { return this.setTile(19, 1);
    } else if ((right === 'b') && (above === 'b') && (aboveRight === 'b')) { return this.setTile(20, 1);
    } else if ((left  === 'b') && (above === 'b') && (aboveLeft  === 'b')) { return this.setTile(21, 1);

    } else if ((right === 'b') && (below === 'b')) { return this.setTile(22, 1);
    } else if ((left  === 'b') && (below === 'b')) { return this.setTile(23, 1);
    } else if ((right === 'b') && (above === 'b')) { return this.setTile(24, 1);
    } else if ((left  === 'b') && (above === 'b')) { return this.setTile(25, 1);
    } else if ((left  === 'b') && (right === 'b')) { return this.setTile(11, 1);
    } else if ((above === 'b') && (below === 'b')) { return this.setTile(12, 1);

    } else if (right === 'b') { return this.setTile(13, 1);
    } else if (left  === 'b') { return this.setTile(14, 1);
    } else if (below === 'b') { return this.setTile(15, 1);
    } else if (above === 'b') { return this.setTile(16, 1);

    } else { return this.setTile(6, 1); }
  }

  retileRiver() {
    // We only care if our neighbours are road, water, or land.
    const neighbourSignificance = (dx, dy) => {
      const n = this.neigh(dx, dy);
      if (n.isType('=')) { return 'r'; }
      if (n.isType('^', ' ', 'b')) { return 'w'; }
      return 'l';
    };

    const above = neighbourSignificance( 0, -1);
    const right = neighbourSignificance( 1,  0);
    const below = neighbourSignificance( 0,  1);
    const left  = neighbourSignificance(-1,  0);

    if      ((above === 'l') && (below === 'l') && (right === 'l') && (left === 'l')) { return this.setTile(30, 2);
    } else if ((above === 'l') && (below === 'l') && (right === 'w') && (left === 'l')) { return this.setTile(26, 2);
    } else if ((above === 'l') && (below === 'l') && (right === 'l') && (left === 'w')) { return this.setTile(27, 2);
    } else if ((above === 'l') && (below === 'w') && (right === 'l') && (left === 'l')) { return this.setTile(28, 2);
    } else if ((above === 'w') && (below === 'l') && (right === 'l') && (left === 'l')) { return this.setTile(29, 2);

    } else if ((above === 'l') && (left  === 'l')) { return this.setTile(6, 3);
    } else if ((above === 'l') && (right === 'l')) { return this.setTile(7, 3);
    } else if ((below === 'l') && (left  === 'l')) { return this.setTile(8, 3);
    } else if ((below === 'l') && (right === 'l')) { return this.setTile(9, 3);
    } else if ((below === 'l') && (above === 'l') && (below === 'l')) { return this.setTile(0, 3);
    } else if ((left  === 'l') && (right === 'l')) { return this.setTile(1, 3);

    } else if (left  === 'l') { return this.setTile(2, 3);
    } else if (below === 'l') { return this.setTile(3, 3);
    } else if (right === 'l') { return this.setTile(4, 3);
    } else if (above === 'l') { return this.setTile(5, 3);

    } else { return this.setTile(1, 0); }
  }

  retileRoad() {
    // We only care if our neighbours are road, water, or land.
    const neighbourSignificance = (dx, dy) => {
      const n = this.neigh(dx, dy);
      if (n.isType('=')) { return 'r'; }
      if (n.isType('^', ' ', 'b')) { return 'w'; }
      return 'l';
    };

    const above      = neighbourSignificance( 0, -1);
    const aboveRight = neighbourSignificance( 1, -1);
    const right      = neighbourSignificance( 1,  0);
    const belowRight = neighbourSignificance( 1,  1);
    const below      = neighbourSignificance( 0,  1);
    const belowLeft  = neighbourSignificance(-1,  1);
    const left       = neighbourSignificance(-1,  0);
    const aboveLeft  = neighbourSignificance(-1, -1);

    if ((aboveLeft !== 'r') && (above === 'r') && (aboveRight !== 'r') && (left === 'r') && (right === 'r') && (belowLeft !== 'r') && (below === 'r') && (belowRight !== 'r')) { return this.setTile(11, 0);

    } else if ((above === 'r') && (left  === 'r') && (right === 'r') && (below === 'r')) { return this.setTile(10, 0);
    } else if ((left  === 'w') && (right === 'w') && (above === 'w') && (below === 'w')) { return this.setTile(26, 0);
    } else if ((right === 'r') && (below === 'r') && (left  === 'w') && (above === 'w')) { return this.setTile(20, 0);
    } else if ((left  === 'r') && (below === 'r') && (right === 'w') && (above === 'w')) { return this.setTile(21, 0);
    } else if ((above === 'r') && (left  === 'r') && (below === 'w') && (right === 'w')) { return this.setTile(22, 0);
    } else if ((right === 'r') && (above === 'r') && (left  === 'w') && (below === 'w')) { return this.setTile(23, 0);

    } else if ((above === 'w') && (below === 'w')) { return this.setTile(24, 0); // and (left == 'r' or right == 'r')
    } else if ((left  === 'w') && (right === 'w')) { return this.setTile(25, 0); // and (above == 'r' or below == 'r')
    } else if ((above === 'w') && (below === 'r')) { return this.setTile(16, 0);
    } else if ((right === 'w') && (left  === 'r')) { return this.setTile(17, 0);
    } else if ((below === 'w') && (above === 'r')) { return this.setTile(18, 0);
    } else if ((left  === 'w') && (right === 'r')) { return this.setTile(19, 0);

    } else if ((right === 'r') && (below === 'r') && (above === 'r') && ((aboveRight === 'r') || (belowRight === 'r'))) { return this.setTile(27, 0);
    } else if ((left  === 'r') && (right === 'r') && (below === 'r') && ((belowLeft  === 'r') || (belowRight === 'r'))) { return this.setTile(28, 0);
    } else if ((left  === 'r') && (above === 'r') && (below === 'r') && ((belowLeft  === 'r') || (aboveLeft  === 'r'))) { return this.setTile(29, 0);
    } else if ((left  === 'r') && (right === 'r') && (above === 'r') && ((aboveRight === 'r') || (aboveLeft  === 'r'))) { return this.setTile(30, 0);

    } else if ((left  === 'r') && (right === 'r') && (below === 'r')) { return this.setTile(12, 0);
    } else if ((left  === 'r') && (above === 'r') && (below === 'r')) { return this.setTile(13, 0);
    } else if ((left  === 'r') && (right === 'r') && (above === 'r')) { return this.setTile(14, 0);
    } else if ((right === 'r') && (above === 'r') && (below === 'r')) { return this.setTile(15, 0);

    } else if ((below === 'r') && (right === 'r') && (belowRight === 'r')) { return this.setTile(6, 0);
    } else if ((below === 'r') && (left  === 'r') && (belowLeft  === 'r')) { return this.setTile(7, 0);
    } else if ((above === 'r') && (left  === 'r') && (aboveLeft  === 'r')) { return this.setTile(8, 0);
    } else if ((above === 'r') && (right === 'r') && (aboveRight === 'r')) { return this.setTile(9, 0);

    } else if ((below === 'r') && (right === 'r')) { return this.setTile(2, 0);
    } else if ((below === 'r') && (left  === 'r')) { return this.setTile(3, 0);
    } else if ((above === 'r') && (left  === 'r')) { return this.setTile(4, 0);
    } else if ((above === 'r') && (right === 'r')) { return this.setTile(5, 0);

    } else if ((right === 'r') || (left  === 'r')) { return this.setTile(0, 1);
    } else if ((above === 'r') || (below === 'r')) { return this.setTile(1, 1);

    } else { return this.setTile(10, 0); }
  }

  retileForest() {
    // Check in which directions we have adjoining forest.
    const above = this.neigh( 0, -1).isType('#');
    const right = this.neigh( 1,  0).isType('#');
    const below = this.neigh( 0,  1).isType('#');
    const left  = this.neigh(-1,  0).isType('#');

    if      (!above && !left &&  right &&  below) { return this.setTile(9, 9);
    } else if (!above &&  left && !right &&  below) { return this.setTile(10, 9);
    } else if  (above &&  left && !right && !below) { return this.setTile(11, 9);
    } else if  (above && !left &&  right && !below) { return this.setTile(12, 9);
    } else if  (above && !left && !right && !below) { return this.setTile(16, 9);
    } else if (!above && !left && !right &&  below) { return this.setTile(15, 9);
    } else if (!above &&  left && !right && !below) { return this.setTile(14, 9);
    } else if (!above && !left &&  right && !below) { return this.setTile(13, 9);
    } else if (!above && !left && !right && !below) { return this.setTile(8, 9);
    } else { return this.setTile(3, 1); }
  }

  retileBoat() {
    // We only care if our neighbours are water or land.
    const neighbourSignificance = (dx, dy) => {
      const n = this.neigh(dx, dy);
      if (n.isType('^', ' ', 'b')) { return 'w'; }
      return 'l';
    };

    const above = neighbourSignificance( 0, -1);
    const right = neighbourSignificance( 1,  0);
    const below = neighbourSignificance( 0,  1);
    const left  = neighbourSignificance(-1,  0);

    if      ((above !== 'w') && (left  !== 'w')) { return this.setTile(15, 6);
    } else if ((above !== 'w') && (right !== 'w')) { return this.setTile(16, 6);
    } else if ((below !== 'w') && (right !== 'w')) { return this.setTile(17, 6);
    } else if ((below !== 'w') && (left  !== 'w')) { return this.setTile(14, 6);

    } else if (left  !== 'w') { return this.setTile(12, 6);
    } else if (right !== 'w') { return this.setTile(13, 6);
    } else if (below !== 'w') { return this.setTile(10, 6);

    } else { return this.setTile(11, 6); }
  }
}


//### View class

// This is an interface for map views. Map views are responsible for actually displaying the map on
// the screen. This class also functions as the do-nothing dummy implementation. You need not
// inherit from this class, just make sure whatever view object you use responds to the methods
// declared here.
class MapView {
  // Called every time a tile changes, with the tile reference and the new tile coordinates to use.
  // This is also called on Map#setView, once for every tile.
  onRetile(cell, tx, ty) {}
}


//### Map objects

// The following are interfaces and dummy default implementations of map objects. If a subclass
// of `Map` wishes to use different classes for map objects, it simply needs to define new classes
// with similar constructors and exposing the same attributes.

class MapObject {
  constructor(map, x, y) {
    this.map = map;
    this.x = x;
    this.y = y;
    this.cell = this.map.cells[this.y][this.x];
  }
}

class Pillbox extends MapObject {
  constructor(map, x, y, owner_idx, armour, speed) {
    super(map, x, y);
    this.owner_idx = owner_idx;
    this.armour = armour;
    this.speed = speed;
  }
}

class Base extends MapObject {
  constructor(map, x, y, owner_idx, armour, shells, mines) {
    super(map, x, y);
    this.owner_idx = owner_idx;
    this.armour = armour;
    this.shells = shells;
    this.mines = mines;
  }
}

class Start extends MapObject {
  constructor(map, x, y, direction) {
    super(map, x, y);
    this.direction = direction;
  }
}


//### Map class

class Map {
  static initClass() {
    this.prototype.CellClass = MapCell;
    this.prototype.PillboxClass = Pillbox;
    this.prototype.BaseClass = Base;
    this.prototype.StartClass = Start;
  }

  // Initialize the map array.
  constructor() {
    this.view = new MapView();

    this.pills = [];
    this.bases = [];
    this.starts = [];

    this.cells = new Array(MAP_SIZE_TILES);
    for (let y = 0, end = MAP_SIZE_TILES, asc = 0 <= end; asc ? y < end : y > end; asc ? y++ : y--) {
      var row = (this.cells[y] = new Array(MAP_SIZE_TILES));
      for (var x = 0, end1 = MAP_SIZE_TILES, asc1 = 0 <= end1; asc1 ? x < end1 : x > end1; asc1 ? x++ : x--) {
        row[x] = new this.CellClass(this, x, y);
      }
    }
  }

  setView(view) {
    this.view = view;
    return this.retile();
  }

  // Get the cell at the given tile coordinates, or return a dummy cell.
  cellAtTile(x, y) {
    let cell;
    if ((cell = this.cells[y] != null ? this.cells[y][x] : undefined)) { return cell;
    } else { return new this.CellClass(this, x, y, {isDummy: true}); }
  }

  // Iterate over the map cells, either the complete map or a specific area.
  // The callback function will have each cell available as +this+.
  each(cb, sx, sy, ex, ey) {
    if ((sx == null) || !(sx >= 0)) { sx = 0; }
    if ((sy == null) || !(sy >= 0)) { sy = 0; }
    if ((ex == null) || !(ex < MAP_SIZE_TILES)) { ex = MAP_SIZE_TILES - 1; }
    if ((ey == null) || !(ey < MAP_SIZE_TILES)) { ey = MAP_SIZE_TILES - 1; }

    for (let y = sy, end = ey, asc = sy <= end; asc ? y <= end : y >= end; asc ? y++ : y--) {
      var row = this.cells[y];
      for (var x = sx, end1 = ex, asc1 = sx <= end1; asc1 ? x <= end1 : x >= end1; asc1 ? x++ : x--) {
        cb(row[x]);
      }
    }

    return this;
  }

  // Clear the map, or a specific area, by filling it with deep sea tiles.
  // Note: this will not do any retiling!
  clear(sx, sy, ex, ey) {
    return this.each(function(cell) {
      cell.type = TERRAIN_TYPES['^'];
      return cell.mine = cell.isEdgeCell();
    }
    , sx, sy, ex, ey);
  }

  // Recalculate the tile cache for each cell, or for a specific area.
  retile(sx, sy, ex, ey) {
    return this.each(cell => cell.retile()
    , sx, sy, ex, ey);
  }

  // Find the cell at the center of the 'painted' map area.
  findCenterCell() {
    let l, r;
    let t = (l = MAP_SIZE_TILES - 1);
    let b = (r = 0);
    this.each(function(c) {
      if (l > c.x) { l = c.x; }
      if (r < c.x) { r = c.x; }
      if (t > c.y) { t = c.y; }
      if (b < c.y) { return b = c.y; }
    });
    if (l > r) {
      t = (l = 0);
      b = (r = MAP_SIZE_TILES - 1);
    }
    const x = round(l + ((r - l) / 2));
    const y = round(t + ((b - t) / 2));
    return this.cellAtTile(x, y);
  }

  //### Saving and loading

  // Dump the map to an array of octets in BMAP format.
  dump(options) {
    let ex, seq, sx, y;
    if (!options) { options = {}; }

    // Private helper for collecting consecutive cells of the same type.
    const consecutiveCells = function(row, cb) {
      let currentType = null;
      let startx = null;
      let count = 0;
      for (let x = 0; x < row.length; x++) {
        var cell = row[x];
        var num = cell.getNumericType();

        if (currentType === num) {
          count++;
          continue;
        }

        if (currentType != null) { cb(currentType, count, startx); }

        currentType = num;
        startx = x;
        count = 1;
      }

      if (currentType != null) { cb(currentType, count, startx); }
    };

    // Private helper for encoding an array of nibbles to an array of octets.
    const encodeNibbles = function(nibbles) {
      const octets = [];
      let val = null;
      for (let i = 0; i < nibbles.length; i++) {
        var nibble = nibbles[i];
        nibble = nibble & 0x0F;
        if ((i % 2) === 0) {
          val = nibble << 4;
        } else {
          octets.push(val + nibble);
          val = null;
        }
      }
      if (val != null) { octets.push(val); }
      return octets;
    };

    // Process options.
    const pills =  options.noPills  ? [] : this.pills;
    const bases =  options.noBases  ? [] : this.bases;
    const starts = options.noStarts ? [] : this.starts;

    // Build the header.
    let data = Array.from('BMAPBOLO').map((c) => c.charCodeAt(0));
    data.push(1, pills.length, bases.length, starts.length);
    for (var p of Array.from(pills)) {  data.push(p.x, p.y, p.owner_idx, p.armour, p.speed); }
    for (var b of Array.from(bases)) {  data.push(b.x, b.y, b.owner_idx, b.armour, b.shells, b.mines); }
    for (var s of Array.from(starts)) { data.push(s.x, s.y, s.direction); }

    // While building the map data, we collect sequences and runs.
    // What follows are helpers to deal with flushing these two arrays to data.
    let run = (seq = (sx = (ex = (y = null))));

    // Flush the current run, and push it to data.
    const flushRun = function() {
      if (run == null) { return; }

      flushSequence();

      const octets = encodeNibbles(run);
      data.push(octets.length + 4, y, sx, ex);
      data = data.concat(octets);

      return run = null;
    };

    // Ensure there's enough space in the run, or start a new one.
    const ensureRunSpace = function(numNibbles) {
      if (!((((255 - 4) * 2) - run.length) < numNibbles)) { return; }
      flushRun();

      run = [];
      return sx = ex;
    };

    // Flush the current sequence, and push it to the run.
    var flushSequence = function() {
      if (seq == null) { return; }

      // Prevent infinite recursion.
      const localSeq = seq;
      seq = null;

      ensureRunSpace(localSeq.length + 1);
      run.push(localSeq.length - 1);
      run = run.concat(localSeq);
      return ex += localSeq.length;
    };

    // Build the runs of map data.
    for (var row of Array.from(this.cells)) {
      ({
        y
      } = row[0]);
      run = (sx = (ex = (seq = null)));
      consecutiveCells(row, function(type, count, x) {
        // Deep sea cells are simply omitted in the map data.
        if (type === -1) {
          flushRun();  // The previous run ends here.
          return;
        }

        // Create the new run of we're at the start.
        if (run == null) {
          run = [];
          sx = (ex = x);
        }

        // Add a long sequence if we have 3 or more of the same type in a row.
        if (count > 2) {
          // Flush existing short sequence.
          flushSequence();
          // Add long sequences until count is exhausted.
          // Because the size is a nibble, we can only encode sequences of 2..9.
          while (count > 2) {
            ensureRunSpace(2);
            var seqLen = min(count, 9);
            run.push(seqLen + 6, type);
            ex += seqLen;
            count -= seqLen;
          }
        }
          // Fall-through, the remaining count may allow for a short sequence.

        return (() => {
          const result = [];
          while (count > 0) {
          // Add the short sequence.
            if (seq == null) { seq = []; }
            seq.push(type);
            // Flush if we run out of space.
            if (seq.length === 8) { flushSequence(); }
            result.push(count--);
          }
          return result;
        })();
      });
    }

    // Flush any remaining stuff.
    flushRun();

    // The sentinel.
    data.push(4, 0xFF, 0xFF, 0xFF);

    return data;
  }

  // Load a map from +buffer+. The buffer is treated as an array of numbers
  // representing octets. So a node.js Buffer will work.
  static load(buffer) {
    // Helper for reading slices out of the buffer.
    let i, args;
    let filePos = 0;
    const readBytes = function(num, msg) {
      const sub = (() => { try {
        // FIXME: This is lame, but ensures we're not dealing with a Buffer object.
        // The only reason for that is because we can't pass a Buffer as a splat.
        return Array.from(buffer.slice(filePos, filePos + num));
      } catch (e) {
        throw msg;
      } })();
      filePos += num;
      return sub;
    };

    // Read the header.
    const magic = readBytes(8, "Not a Bolo map.");
    for (i = 0; i < 'BMAPBOLO'.length; i++) {
      var c = 'BMAPBOLO'[i];
      if (c.charCodeAt(0) !== magic[i]) { throw "Not a Bolo map."; }
    }
    const [version, numPills, numBases, numStarts] = Array.from(readBytes(4, "Incomplete header"));
    if (version !== 1) { throw `Unsupported map version: ${version}`; }

    // Allocate the map.
    const map = new (this)();

    // Read the map objects.
    const pillsData  = (() => {
      let asc, end;
      const result = [];
      for (i = 0, end = numPills, asc = 0 <= end; asc ? i < end : i > end; asc ? i++ : i--) {
        result.push(readBytes(5, "Incomplete pillbox data"));
      }
      return result;
    })();
    const basesData  = (() => {
      let asc1, end1;
      const result1 = [];
      for (i = 0, end1 = numBases, asc1 = 0 <= end1; asc1 ? i < end1 : i > end1; asc1 ? i++ : i--) {
        result1.push(readBytes(6, "Incomplete base data"));
      }
      return result1;
    })();
    const startsData = (() => {
      let asc2, end2;
      const result2 = [];
      for (i = 0, end2 = numStarts, asc2 = 0 <= end2; asc2 ? i < end2 : i > end2; asc2 ? i++ : i--) {
        result2.push(readBytes(3, "Incomplete player start data"));
      }
      return result2;
    })();

    // Read map data.
    while (true) {
      var [dataLen, y, sx, ex] = Array.from(readBytes(4, "Incomplete map data"));
      dataLen -= 4;
      if ((dataLen === 0) && (y === 0xFF) && (sx === 0xFF) && (ex === 0xFF)) { break; }

      var run = readBytes(dataLen, "Incomplete map data");
      var runPos = 0;
      var takeNibble = function() {
        const index = floor(runPos);
        const nibble = index === runPos ?
          (run[index] & 0xF0) >> 4
        :
          (run[index] & 0x0F);
        runPos += 0.5;
        return nibble;
      };

      var x = sx;
      while (x < ex) {
        var seqLen = takeNibble();
        if (seqLen < 8) {
          var asc3, end3;
          for (i = 1, end3 = seqLen+1, asc3 = 1 <= end3; asc3 ? i <= end3 : i >= end3; asc3 ? i++ : i--) {
            map.cellAtTile(x++, y).setType(takeNibble(), undefined, -1);
          }
        } else {
          var asc4, end4;
          var type = takeNibble();
          for (i = 1, end4 = seqLen-6, asc4 = 1 <= end4; asc4 ? i <= end4 : i >= end4; asc4 ? i++ : i--) {
            map.cellAtTile(x++, y).setType(type, undefined, -1);
          }
        }
      }
    }

    // Instantiate the map objects. Late, so they can do postprocessing on the map.
    map.pills  = (() => {
      const result3 = [];
      for (args of Array.from(pillsData)) {          result3.push(new map.PillboxClass(map, ...Array.from(args)));
      }
      return result3;
    })();
    map.bases  = (() => {
      const result4 = [];
      for (args of Array.from(basesData)) {          result4.push(new    map.BaseClass(map, ...Array.from(args)));
      }
      return result4;
    })();
    map.starts = (() => {
      const result5 = [];
      for (args of Array.from(startsData)) {         result5.push(new   map.StartClass(map, ...Array.from(args)));
      }
      return result5;
    })();

    return map;
  }

  static extended(child) {
    if (!child.load) { return child.load = this.load; }
  }
}
Map.initClass();


//### Exports
exports.TERRAIN_TYPES = TERRAIN_TYPES;
exports.MapView = MapView;
exports.Map = Map;

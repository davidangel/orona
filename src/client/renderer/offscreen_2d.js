/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS202: Simplify dynamic range loops
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
// This renderer builds on the Direct2dRenderr, but caches segments of the map, and then blits these
// larger segments rather than individual tiles. The idea is to reduce the large amount of drawImage
// calls.
//
// At the time of writing, this doesn't appear to increase performance in Chromium at all, compared
// to Direct2dRenderer. However, Firefox does get a really nice speed boost out of it.


const {floor}            = Math;
const {TILE_SIZE_PIXELS,
 MAP_SIZE_TILES}   = require('../../constants');
const Common2dRenderer   = require('./common_2d');


// The width and height of segments. The total map size in tiles should be divisible by this number.
const SEGMENT_SIZE_TILES = 16;
// The width and height of the map in segments.
const MAP_SIZE_SEGMENTS = MAP_SIZE_TILES / SEGMENT_SIZE_TILES;
// The width and height of a segment in pixels.
const SEGMENT_SIZE_PIXEL = SEGMENT_SIZE_TILES * TILE_SIZE_PIXELS;


//### Cached segment

// This class represents a single map segment.
class CachedSegment {

  constructor(renderer, x, y) {
    // Tile bounds
    this.renderer = renderer;
    this.sx = x * SEGMENT_SIZE_TILES;
    this.sy = y * SEGMENT_SIZE_TILES;
    this.ex = (this.sx + SEGMENT_SIZE_TILES) - 1;
    this.ey = (this.sy + SEGMENT_SIZE_TILES) - 1;

    // Pixel bounds
    this.psx = x * SEGMENT_SIZE_PIXEL;
    this.psy = y * SEGMENT_SIZE_PIXEL;
    this.pex = (this.psx + SEGMENT_SIZE_PIXEL) - 1;
    this.pey = (this.psy + SEGMENT_SIZE_PIXEL) - 1;

    this.canvas = null;
  }

  isInView(sx, sy, ex, ey) {
    // Compare canvas pixel bounds to our own.
    // We can reduce the number of conditions by checking if we don't overlap, rather than if we do.
    if      ((ex < this.psx) || (ey < this.psy)) { return false;
    } else if ((sx > this.pex) || (sy > this.pey)) { return false;
    } else { return true; }
  }

  build() {
    // Create the canvas.
    this.canvas = $('<canvas/>')[0];
    this.canvas.width = (this.canvas.height = SEGMENT_SIZE_PIXEL);
    this.ctx = this.canvas.getContext('2d');

    // Apply a permanent translation, so we can draw regular map pixel coordinates.
    this.ctx.translate(-this.psx, -this.psy);

    // Iterate the map tiles in this segment, and draw them.
    return this.renderer.world.map.each(cell => {
      return this.onRetile(cell, cell.tile[0], cell.tile[1]);
    }
    , this.sx, this.sy, this.ex, this.ey);
  }

  clear() {
    return this.canvas = (this.ctx = null);
  }

  onRetile(cell, tx, ty) {
    let obj;
    if (!this.canvas) { return; }
    if ((obj = cell.pill || cell.base)) {
      return this.renderer.drawStyledTile(cell.tile[0], cell.tile[1], obj.owner != null ? obj.owner.$.team : undefined,
          cell.x * TILE_SIZE_PIXELS, cell.y * TILE_SIZE_PIXELS, this.ctx);
    } else {
      return this.renderer.drawTile(cell.tile[0], cell.tile[1],
          cell.x * TILE_SIZE_PIXELS, cell.y * TILE_SIZE_PIXELS, this.ctx);
    }
  }
}


//### Renderer

// The off-screen renderer keeps a 2D array of instances of MapSegment.
class Offscreen2dRenderer extends Common2dRenderer {

  setup() {
    super.setup(...arguments);

    this.cache = new Array(MAP_SIZE_SEGMENTS);
    return (() => {
      const result = [];
      for (var y = 0, end = MAP_SIZE_SEGMENTS, asc = 0 <= end; asc ? y < end : y > end; asc ? y++ : y--) {
        var row = (this.cache[y] = new Array(MAP_SIZE_SEGMENTS));
        result.push(__range__(0, MAP_SIZE_SEGMENTS, false).map((x) =>
          (row[x] = new CachedSegment(this, x, y))));
      }
      return result;
    })();
  }

  // When a cell is retiled, we store the tile index and update the segment.
  onRetile(cell, tx, ty) {
    if (!this.isMineVisibleToPlayer(cell) && cell.mine && !cell.pill && !cell.base) {
      ty -= 10;
    }
    cell.tile = [tx, ty];

    const segx = floor(cell.x / SEGMENT_SIZE_TILES);
    const segy = floor(cell.y / SEGMENT_SIZE_TILES);
    return this.cache[segy][segx].onRetile(cell, tx, ty);
  }

  // Drawing the map is a matter of iterating the map segments that are on-screen, and blitting
  // the off-screen canvas to the main canvas. The segments are prepared on-demand from here, and
  // extra care is taken to only build one segment per frame.
  drawMap(sx, sy, w, h) {
    const ex = (sx + w) - 1;
    const ey = (sy + h) - 1;

    let alreadyBuiltOne = false;
    for (var row of Array.from(this.cache)) {
      for (var segment of Array.from(row)) {
        // Skip if not in view.
        if (!segment.isInView(sx, sy, ex, ey)) {
          if (segment.canvas) { segment.clear(); }
          continue;
        }

        // Make sure the segment buffer is available.
        if (!segment.canvas) {
          if (alreadyBuiltOne) { continue; }
          segment.build();
          alreadyBuiltOne = true;
        }

        // Blit the segment to the screen.
        this.ctx.drawImage(segment.canvas,
          0,           0,           SEGMENT_SIZE_PIXEL, SEGMENT_SIZE_PIXEL,
          segment.psx, segment.psy, SEGMENT_SIZE_PIXEL, SEGMENT_SIZE_PIXEL);
      }
    }

  }
}


//### Exports
module.exports = Offscreen2dRenderer;

function __range__(left, right, inclusive) {
  let range = [];
  let ascending = left < right;
  let end = !inclusive ? right : ascending ? right + 1 : right - 1;
  for (let i = left; ascending ? i < end : i > end; ascending ? i++ : i--) {
    range.push(i);
  }
  return range;
}
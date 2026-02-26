/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
// The Direct2D renderer is probably the simplest possible renderer there is. It has nothing to do
// with the DirectX technology. The name simply means that is draws the map tile-for-tile each frame.
// This method appears to be fairly slow, at the time of writing.


const {floor, ceil}      = Math;
const {TILE_SIZE_PIXELS} = require('../../constants');
const Common2dRenderer   = require('./common_2d');


class Direct2dRenderer extends Common2dRenderer {

  onRetile(cell, tx, ty) {
    if (!this.isMineVisibleToPlayer(cell) && cell.mine && !cell.pill && !cell.base) {
      ty -= 10;
    }
    return cell.tile = [tx, ty];
  }

  drawMap(sx, sy, w, h) {
    // Calculate pixel boundaries.
    const ex = (sx + w) - 1;
    const ey = (sy + h) - 1;

    // Calculate tile boundaries.
    const stx = floor(sx / TILE_SIZE_PIXELS);
    const sty = floor(sy / TILE_SIZE_PIXELS);
    const etx =  ceil(ex / TILE_SIZE_PIXELS);
    const ety =  ceil(ey / TILE_SIZE_PIXELS);

    // Iterate each tile in view.
    return this.world.map.each(cell => {
      let obj;
      if ((obj = cell.pill || cell.base)) {
        return this.drawStyledTile(cell.tile[0], cell.tile[1], obj.owner != null ? obj.owner.$.team : undefined,
            cell.x * TILE_SIZE_PIXELS, cell.y * TILE_SIZE_PIXELS);
      } else {
        return this.drawTile(cell.tile[0], cell.tile[1],
            cell.x * TILE_SIZE_PIXELS, cell.y * TILE_SIZE_PIXELS);
      }
    }
    , stx, sty, etx, ety);
  }
}


//### Exports
module.exports = Direct2dRenderer;

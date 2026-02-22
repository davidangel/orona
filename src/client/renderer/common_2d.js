/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS202: Simplify dynamic range loops
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
// This is a base class used to share common code between the Canvas2D renderers. It deals with a
// fair amount of work concerning canvas initialization, preparing styled tilemaps and drawing
// individual tiles. Subclasses differ mostly in the way they deal with drawing the map.


const {min, round, PI, sin, cos} = Math;
const {TILE_SIZE_PIXELS, PIXEL_SIZE_WORLD} = require('../../constants');
const {distance, heading} = require('../../helpers');
const BaseRenderer = require('./base');
const TEAM_COLORS  = require('../../team_colors');


class Common2dRenderer extends BaseRenderer {

  setup() {
    // Initialize the canvas.
    try {
      this.ctx = this.canvas[0].getContext('2d');
      this.ctx.drawImage;  // Just access it, see if it throws.
    } catch (e) {
      throw `Could not initialize 2D canvas: ${e.message}`;
    }

  // We need to get the raw pixel data from the overlay.
    const img = this.images.overlay;
    // Create a temporary canvas.
    const temp = $('<canvas/>')[0];
    temp.width  = img.width;
    temp.height = img.height;
    // Copy the Image onto the canvas.
    const ctx = temp.getContext('2d');
    ctx.globalCompositeOperation = 'copy';
    ctx.drawImage(img, 0, 0);
    // Get the CanvasPixelArray object representing the overlay.
    const imageData = ctx.getImageData(0, 0, img.width, img.height);
    this.overlay = imageData.data;

    // This contains prestyled tilemaps, index by style/team.
    return this.prestyled = {};
  }

  // We use an extra parameter `ctx` here, so that the offscreen renderer can
  // use the context specific to segments.
  setObjectOpacity(opacity) {
    this.ctx.globalAlpha = opacity;
  }
  drawTile(tx, ty, dx, dy, ctx) {
    return (ctx || this.ctx).drawImage(this.images.base,
      tx * TILE_SIZE_PIXELS, ty * TILE_SIZE_PIXELS, TILE_SIZE_PIXELS, TILE_SIZE_PIXELS,
      dx,                    dy,                    TILE_SIZE_PIXELS, TILE_SIZE_PIXELS);
  }

  createPrestyled(color) {
    // Get the base image and it's width and height.
    const base = this.images.styled;
    const {width, height} = base;

    // Create the new canvas.
    const source = $('<canvas/>')[0];
    source.width  = width;
    source.height = height;

    // Copy the base image into it.
    const ctx = source.getContext('2d');
    ctx.globalCompositeOperation = 'copy';
    ctx.drawImage(base, 0, 0);

    // Use pixel manipulation to blit the overlay.
    const imageData = ctx.getImageData(0, 0, width, height);
    const {
      data
    } = imageData;
    for (let x = 0, end = width, asc = 0 <= end; asc ? x < end : x > end; asc ? x++ : x--) {
      for (var y = 0, end1 = height, asc1 = 0 <= end1; asc1 ? y < end1 : y > end1; asc1 ? y++ : y--) {
        var i = 4 * ((y * width) + x);
        var factor = this.overlay[i] / 255;
        data[i+0] = round((factor * color.r) + ((1 - factor) * data[i+0]));
        data[i+1] = round((factor * color.g) + ((1 - factor) * data[i+1]));
        data[i+2] = round((factor * color.b) + ((1 - factor) * data[i+2]));
        data[i+3] = min(255, data[i+3] + this.overlay[i]);
      }
    }
    ctx.putImageData(imageData, 0, 0);

    // All done, return.
    return source;
  }

  drawStyledTile(tx, ty, style, dx, dy, ctx) {
    // Get the prestyled tilemap, or create it.
    let source;
    if (!(source = this.prestyled[style])) {
      let color;
      source =
        (color = TEAM_COLORS[style]) ?
          (this.prestyled[style] = this.createPrestyled(color))
        :
          this.images.styled;
    }

    // Draw from the prestyled tilemap.
    return (ctx || this.ctx).drawImage(source,
      tx * TILE_SIZE_PIXELS, ty * TILE_SIZE_PIXELS, TILE_SIZE_PIXELS, TILE_SIZE_PIXELS,
      dx,                    dy,                    TILE_SIZE_PIXELS, TILE_SIZE_PIXELS);
  }

  centerOn(x, y, cb) {
    this.ctx.save();
    const [left, top, width, height] = Array.from(this.getViewAreaAtWorld(x, y));
    this.ctx.translate(-left, -top);
    cb(left, top, width, height);
    return this.ctx.restore();
  }

  drawBuilderIndicator(b) {
    let dist, x, y;
    const player = b.owner.$;
    if ((dist = distance(player, b)) <= 128) { return; }
    const px = player.x / PIXEL_SIZE_WORLD; const py = player.y / PIXEL_SIZE_WORLD;
    this.ctx.save();

    this.ctx.globalCompositeOperation = 'source-over';
    this.ctx.globalAlpha = min(1.0, (dist - 128) / 1024);
    const offset = min(50, (dist / 10240) * 50) + 32;
    let rad = heading(player, b);
    this.ctx.beginPath();
    this.ctx.moveTo((x = px + (cos(rad) * offset)), (y = py + (sin(rad) * offset)));
    rad += PI;
    this.ctx.lineTo(x + (cos(rad - 0.4) * 10), y + (sin(rad - 0.4) * 10));
    this.ctx.lineTo(x + (cos(rad + 0.4) * 10), y + (sin(rad + 0.4) * 10));
    this.ctx.closePath();
    this.ctx.fillStyle = 'yellow';
    this.ctx.fill();

    return this.ctx.restore();
  }

  drawNames() {
    this.ctx.save();
    this.ctx.strokeStyle = (this.ctx.fillStyle = 'white');
    this.ctx.font = 'bold 11px sans-serif';
    this.ctx.textBaselines = 'alphabetic';
    this.ctx.textAlign = 'left';
    const {
      player
    } = this.world;
    let x, y;
    for (var tank of Array.from(this.world.tanks)) {
      if (tank.name && (tank.armour !== 255) && (tank !== player)) {
        if (!this.isVisibleToPlayer(tank)) { continue; }
      
        if (player) {
          var dist;
          if ((dist = distance(player, tank)) <= 768) { continue; }
          this.ctx.globalAlpha = min(1.0, (dist - 768) / 1536);
        } else {
          this.ctx.globalAlpha = 1.0;
        }
        var metrics = this.ctx.measureText(tank.name);
        this.ctx.beginPath();
        this.ctx.moveTo(
          (x = round(tank.x / PIXEL_SIZE_WORLD) + 16),
          (y = round(tank.y / PIXEL_SIZE_WORLD) - 16));
        this.ctx.lineTo((x += 12), (y -= 9));
        this.ctx.lineTo(x + metrics.width, y);
        this.ctx.stroke();
        this.ctx.fillText(tank.name, x, y - 2);
      }
    }
    return this.ctx.restore();
  }
}

//### Exports
module.exports = Common2dRenderer;

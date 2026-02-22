/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
// The base class for all renderers is defined here. A renderer is responsible for drawing the map,
// objects on the map, HUD map overlays and HUD screen overlays. Especially of the last two points,
// a lot of shared code lives in this base class. Methods that need to be implemented by subclasses
// are stubbed out here. All renderers also implement the `MapView` interface.


const {min, max, round, cos, sin, PI, sqrt} = Math;
const {TILE_SIZE_PIXELS, TILE_SIZE_WORLD, PIXEL_SIZE_WORLD, MAP_SIZE_PIXELS} = require('../../constants');
const sounds      = require('../../sounds');
const TEAM_COLORS = require('../../team_colors');


class BaseRenderer {

  // The constructor takes a reference to the World it needs to draw. Once the constructor finishes,
  // `Map#setView` is called to hook up this renderer instance, which causes onRetile to be invoked
  // once for each tile to initialize.
  constructor(world) {
    this.world = world;
    this.images = this.world.images;
    this.soundkit = this.world.soundkit;
    this.opacityState = {};

    this.canvas = $('<canvas/>').appendTo('body');
    this.lastCenter = this.world.map.findCenterCell().getWorldCoordinates();

    this.mouse = [0, 0];
    this.canvas.click(e => this.handleClick(e));
    this.canvas.mousemove(e => { return this.mouse = [e.pageX, e.pageY]; });

    this.setup();

    this.handleResize();
    $(window).resize(() => this.handleResize());
  }

  // Subclasses use this as their constructor.
  setup() {}

  // Check if an object should be visible to the player.
  // Enemy tanks in forest tiles are hidden from view, unless within 2 tiles.
  isVisibleToPlayer(obj) {
    const player = this.world.player;
    if (!player) { 
      this._hasPlayer = false;
      return true; 
    }
    this._hasPlayer = true;
    if (obj === player) { return true; }
    if (obj.team === 255) { return true; }
    if (obj.isAlly == null) { return true; }
    if (obj.isAlly(player)) { return true; }
    if (obj.cell && obj.cell.isType('#')) {
      const dist = Math.sqrt((obj.x - player.x) ** 2 + (obj.y - player.y) ** 2);
      const TILE_DIST_THRESHOLD = 2 * TILE_SIZE_WORLD;
      if (dist > TILE_DIST_THRESHOLD) { return false; }
    }
    return true;
  }

  // This methods takes x and y coordinates to center the screen on. The callback provided should be
  // invoked exactly once. Any drawing operations used from within the callback will have a
  // translation applied so that the given coordinates become the center on the screen.
  centerOn(x, y, cb) {}

  // Draw the tile (tx,ty), which are x and y indices in the base tilemap (and not pixel
  // coordinates), so that the top left corner of the tile is placed at (sdx,sdy) pixel coordinates
  // on the screen. The destination coordinates may be subject to translation from centerOn.
  drawTile(tx, ty, sdx, sdy) {}

  // Similar to drawTile, but draws from the styled tilemap. Takes an additional parameter `style`,
  // which is a selection from the team colors. The overlay tile is drawn in this color on top of
  // the tile from the styled tilemap. If the style doesn't exist, no overlay is drawn.
  drawStyledTile(tx, ty, style, sdx, sdy) {}

  // Draw the map section that intersects with the given boundary box (sx,sy,w,h). The boundary
  // box is given in pixel coordinates. This may very well be a no-op if the renderer can do all of
  // its work in onRetile.
  drawMap(sx, sy, w, h) {}

  // Draw an arrow towards the builder. Only called when the builder is outside the tank.
  drawBuilderIndicator(builder) {}

  // Inherited from MapView.
  onRetile(cell, tx, ty) {}

  //### Common functions.

  // Draw a single frame.
  draw() {
    let x, y;
    if (this.world.player) {
      ({x, y} = this.world.player);
      if (this.world.player.fireball != null) { ({x, y} = this.world.player.fireball.$); }
    } else {
      x = (y = null);
    }

    // Remember or restore the last center position. We use this after tank
    // death, so as to keep drawing something useful while we fade.
    if ((x == null) || (y == null)) {
      [x, y] = Array.from(this.lastCenter);
    } else {
      this.lastCenter = [x, y];
    }

    this.centerOn(x, y, (left, top, width, height) => {
      // Draw all canvas elements.
      this.drawMap(left, top, width, height);
      for (var obj of Array.from(this.world.objects)) {
        if ((obj.styled != null) && (obj.x != null) && (obj.y != null)) {
          const shouldBeVisible = this.isVisibleToPlayer(obj);
          
          // Initialize opacity if needed
          if (this.opacityState[obj.idx] === undefined) {
            this.opacityState[obj.idx] = shouldBeVisible ? 1 : 0;
          }
          
          // Fade in/out
          if (shouldBeVisible) {
            this.opacityState[obj.idx] = Math.min(1, this.opacityState[obj.idx] + (1 / 30));
          } else {
            this.opacityState[obj.idx] = Math.max(0, this.opacityState[obj.idx] - (1 / 30));
          }
          
          if (this.opacityState[obj.idx] <= 0) { continue; }
          
          if (this.opacityState[obj.idx] < 1) {
            this.setObjectOpacity(this.opacityState[obj.idx]);
          }
          
          var [tx, ty] = Array.from(obj.getTile());
          var ox = round(obj.x / PIXEL_SIZE_WORLD) - (TILE_SIZE_PIXELS / 2);
          var oy = round(obj.y / PIXEL_SIZE_WORLD) - (TILE_SIZE_PIXELS / 2);
          switch (obj.styled) {
            case true:  this.drawStyledTile(tx, ty, obj.team, ox, oy); break;
            case false: this.drawTile(tx, ty, ox, oy); break;
          }
          
          if (this.opacityState[obj.idx] < 1) {
            this.setObjectOpacity(1);
          }
        }
      }
      return this.drawOverlay();
    });

    // Update all DOM HUD elements.
    if (this.hud) { return this.updateHud(); }
  }

  // Play a sound effect.
  playSound(sfx, x, y, owner) {
    const mode =
      (() => {
      if (this.world.player && (owner === this.world.player)) { return 'Self';
      } else {
        const dx = x - this.lastCenter[0]; const dy = y - this.lastCenter[1];
        const dist = sqrt((dx*dx) + (dy*dy));
        if (dist > (40 * TILE_SIZE_WORLD)) { return 'None';
        } else if (dist > (15 * TILE_SIZE_WORLD)) { return 'Far';
        } else { return 'Near'; }
      }
    })();
    if (mode === 'None') { return; }
    const name = (() => { switch (sfx) {
      case sounds.BIG_EXPLOSION:  return `bigExplosion${mode}`;
      case sounds.BUBBLES:        if (mode === 'Self') { return "bubbles"; } break;
      case sounds.FARMING_TREE:   return `farmingTree${mode}`;
      case sounds.HIT_TANK:       return `hitTank${mode}`;
      case sounds.MAN_BUILDING:   return `manBuilding${mode}`;
      case sounds.MAN_DYING:      return `manDying${mode}`;
      case sounds.MAN_LAY_MINE:   if (mode === 'Near') { return "manLayMineNear"; } break;
      case sounds.MINE_EXPLOSION: return `mineExplosion${mode}`;
      case sounds.SHOOTING:       return `shooting${mode}`;
      case sounds.SHOT_BUILDING:  return `shotBuilding${mode}`;
      case sounds.SHOT_TREE:      return `shotTree${mode}`;
      case sounds.TANK_SINKING:   return `tankSinking${mode}`;
    } })();
    if (name) { return this.soundkit[name](); }
  }

  handleResize() {
    this.canvas[0].width  = window.innerWidth;
    this.canvas[0].height = window.innerHeight;
    this.canvas.css({
      width:  window.innerWidth + 'px',
      height: window.innerHeight + 'px'
    });

    // Adjust the body as well, to prevent accidental scrolling on some browsers.
    return $('body').css({
      width:  window.innerWidth + 'px',
      height: window.innerHeight + 'px'
    });
  }

  handleClick(e) {
    e.preventDefault();
    this.world.input.focus();
    if (!this.currentTool) { return; }

    const [mx, my] = Array.from(this.mouse);
    const cell = this.getCellAtScreen(mx, my);
    const [action, trees, flexible] = Array.from(this.world.checkBuildOrder(this.currentTool, cell));
    if (action) { return this.world.buildOrder(action, trees, cell); }
  }

  // Get the view area in pixel coordinates when looking at the given world coordinates.
  getViewAreaAtWorld(x, y) {
    const {width, height} = this.canvas[0];
    let left = round((x / PIXEL_SIZE_WORLD) - (width  / 2));
    left = max(0, min(MAP_SIZE_PIXELS - width, left));
    let top  = round((y / PIXEL_SIZE_WORLD) - (height / 2));
    top  = max(0, min(MAP_SIZE_PIXELS - height, top));
    return [left, top, width, height];
  }

  // Get the map cell at the given screen coordinates.
  getCellAtScreen(x, y) {
    const [cameraX, cameraY] = Array.from(this.lastCenter);
    const [left, top, width, height] = Array.from(this.getViewAreaAtWorld(cameraX, cameraY));
    return this.world.map.cellAtPixel(left + x, top + y);
  }

  //### HUD elements

  // Draw HUD elements that overlay the map. These are elements that need to be drawn in regular
  // game coordinates, rather than screen coordinates.
  drawOverlay() {
    let player;
    if ((player = this.world.player) && (player.armour !== 255)) {
      const b = player.builder.$;
      if ((b.order !== b.states.inTank) && (b.order !== b.states.parachuting)) {
        this.drawBuilderIndicator(b);
      }
      this.drawReticle();
    }
    this.drawNames();
    return this.drawCursor();
  }

  drawReticle() {
    const distance = this.world.player.firingRange * TILE_SIZE_PIXELS;
    const rad = ((256 - this.world.player.direction) * 2 * PI) / 256;
    const x = round((this.world.player.x / PIXEL_SIZE_WORLD) + (cos(rad) * distance)) - (TILE_SIZE_PIXELS / 2);
    const y = round((this.world.player.y / PIXEL_SIZE_WORLD) + (sin(rad) * distance)) - (TILE_SIZE_PIXELS / 2);
    return this.drawTile(17, 4, x, y);
  }

  drawCursor() {
    const [mx, my] = Array.from(this.mouse);
    const cell = this.getCellAtScreen(mx, my);
    return this.drawTile(18, 6, cell.x * TILE_SIZE_PIXELS, cell.y * TILE_SIZE_PIXELS);
  }

  // Create the HUD container.
  initHud() {
    this.hud = $('<div/>').appendTo('body');
    this.initHudTankStatus();
    this.initHudPillboxes();
    this.initHudBases();
    this.initHudToolSelect();
    this.initHudNotices();
    return this.updateHud();
  }

  initHudTankStatus() {
    const container = $('<div/>', {id: 'tankStatus'}).appendTo(this.hud);
    $('<div/>', {class: 'deco'}).appendTo(container);
    this.tankIndicators = {};
    for (var indicator of ['shells', 'mines', 'armour', 'trees']) {
      var bar = $('<div/>', {class: 'gauge', id: `tank-${indicator}`}).appendTo(container);
      this.tankIndicators[indicator] = $('<div class="gauge-content"></div>').appendTo(bar);
    }
  }

  // Create the pillbox status indicator.
  initHudPillboxes() {
    const container = $('<div/>', {id: 'pillStatus'}).appendTo(this.hud);
    $('<div/>', {class: 'deco'}).appendTo(container);
    this.pillIndicators = (() => {
      const result = [];
      for (var pill of Array.from(this.world.map.pills)) {
        var node = $('<div/>', {class: 'pill'}).appendTo(container);
        result.push([node, pill]);
      }
      return result;
    })();
  }

  // Create the base status indicator.
  initHudBases() {
    const container = $('<div/>', {id: 'baseStatus'}).appendTo(this.hud);
    $('<div/>', {class: 'deco'}).appendTo(container);
    this.baseIndicators = (() => {
      const result = [];
      for (var base of Array.from(this.world.map.bases)) {
        var node = $('<div/>', {class: 'base'}).appendTo(container);
        result.push([node, base]);
      }
      return result;
    })();
  }

  // Create the build tool selection
  initHudToolSelect() {
    this.currentTool = null;
    const tools = $('<div id="tool-select" />').appendTo(this.hud);
    for (var toolType of ['forest', 'road', 'building', 'pillbox', 'mine']) {
      this.initHudTool(tools, toolType);
    }
    return tools.buttonset();
  }

  // Create a single build tool item.
  initHudTool(tools, toolType) {
    const toolname = `tool-${toolType}`;
    const tool = $('<input/>', {type: 'radio', name: 'tool', id: toolname}).appendTo(tools);
    const label = $('<label/>', {for: toolname}).appendTo(tools);
    label.append($('<span/>', {class: `bolo-tool bolo-${toolname}`}));
    return tool.click(e => {
      if (this.currentTool === toolType) {
        this.currentTool = null;
        tools.find('input').removeAttr('checked');
        tools.buttonset('refresh');
      } else {
        this.currentTool = toolType;
      }
      return this.world.input.focus();
    });
  }

  // Show WIP notice and Github ribbon. These are really a temporary hacks, so FIXME someday.
  initHudNotices() {
    if (location.hostname.split('.')[1] === 'github') {
      $('<div/>').html(`\
This is a work-in-progress; less than alpha quality!<br>
To see multiplayer in action, follow instructions on Github.\
`).css({
        'position': 'absolute', 'top': '70px', 'left': '0px', 'width': '100%', 'text-align': 'center',
        'font-family': 'monospace', 'font-size': '16px', 'font-weight': 'bold', 'color': 'white'
      }).appendTo(this.hud);
    }

    if ((location.hostname.split('.')[1] === 'github') || (location.hostname.substr(-6) === '.no.de')) {
      return $('<a href="http://github.com/stephank/orona"></a>')
        .css({'position': 'absolute', 'top': '0px', 'right': '0px'})
        .html('<img src="http://s3.amazonaws.com/github/ribbons/forkme_right_darkblue_121621.png" alt="Fork me on GitHub">')
        .appendTo(this.hud);
    }
  }

  // Update the HUD elements.
  updateHud() {
    // Pillboxes.
    let color, node, statuskey;
    let pill;
    let base;
    for ([node, pill] of Array.from(this.pillIndicators)) {
      statuskey = `${pill.inTank};${pill.carried};${pill.armour};${pill.team}`;
      if (pill.hudStatusKey === statuskey) { continue; }
      pill.hudStatusKey = statuskey;

      if (pill.inTank || pill.carried) {
        node.attr('status', 'carried');
      } else if (pill.armour === 0) {
        node.attr('status', 'dead');
      } else {
        node.attr('status', 'healthy');
      }
      color = TEAM_COLORS[pill.team] || { r: 112, g: 112, b: 112 };
      node.css({'background-color': `rgb(${color.r},${color.g},${color.b})`});
    }

    // Bases.
    for ([node, base] of Array.from(this.baseIndicators)) {
      statuskey = `${base.armour};${base.team}`;
      if (base.hudStatusKey === statuskey) { continue; }
      base.hudStatusKey = statuskey;

      if (base.armour <= 9) {
        node.attr('status', 'vulnerable');
      } else {
        node.attr('status', 'healthy');
      }
      color = TEAM_COLORS[base.team] || { r: 112, g: 112, b: 112 };
      node.css({'background-color': `rgb(${color.r},${color.g},${color.b})`});
    }

    // Tank.
    const p = this.world.player; if (!p.hudLastStatus) { p.hudLastStatus = {}; }
    return (() => {
      const result = [];
      for (var prop in this.tankIndicators) {
        node = this.tankIndicators[prop];
        var value = p.armour === 255 ? 0 : p[prop];
        if (p.hudLastStatus[prop] === value) { continue; }
        p.hudLastStatus[prop] = value;

        result.push(node.css({height: `${round((value / 40) * 100)}%`}));
      }
      return result;
    })();
  }
}


//### Exports
module.exports = BaseRenderer;

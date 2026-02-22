/*
 * decaffeinate suggestions:
 * DS002: Fix invalid constructor
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
// This module contains all the juicy code related to the server. It exposes a factory function
// that returns a Connect-based HTTP server. A single server is capable of hosting multiple games,
// sharing the interval timer and the lobby across these games.


const {random, round} = Math;

const fs   = require('fs');
const url  = require('url');
let path = require('path');

const connect = require('connect');

const { createLoop } = require('villain/loop');
const ServerWorld    = require('villain/world/net/server');
const {pack}         = require('villain/struct');

const WebSocket        = require('faye-websocket');
const MapIndex         = require('./map_index');
const helpers          = require('../helpers');
const BoloWorldMixin   = require('../world_mixin');
const allObjects       = require('../objects/all');
const Tank             = require('../objects/tank');
const WorldMap         = require('../world_map');
const net              = require('../net');
const {TICK_LENGTH_MS} = require('../constants');


//# Server world

class BoloServerWorld extends ServerWorld {
  static initClass() {
  
    this.prototype.authority = true;
  }

  constructor(map) {
    super(...arguments);
    this.map = map;
    this.boloInit();
    this.clients = [];
    this.map.world = this;
    this.oddTick = false;
    this.spawnMapObjects();
  }

  close() {
    return Array.from(this.clients).map((client) =>
      client.end());
  }

  //### Callbacks

  // Update, and then send packets to the client.
  tick() {
    super.tick(...arguments);
    return this.sendPackets();
  }

  // Emit a sound effect from the given location. `owner` is optional.
  soundEffect(sfx, x, y, owner) {
    const ownerIdx = (owner != null) ? owner.idx : 65535;
    return this.changes.push(['soundEffect', sfx, x, y, ownerIdx]);
  }

  // Record map changes.
  mapChanged(cell, oldType, hadMine, oldLife) {
    const {
      ascii
    } = cell.type;
    return this.changes.push(['mapChange', cell.x, cell.y, ascii, cell.life, cell.mine]);
  }

  //### Connection handling.

  onConnect(ws) {
    // Set-up the websocket parameters.
    this.clients.push(ws);
    ws.heartbeatTimer = 0;
    ws.onmessage = e => this.onMessage(ws, e.data);
    ws.onclose = e => this.onEnd(ws, e.code, e.reason);

    // Send the current map state. We don't send pillboxes and bases, because the client
    // receives create messages for those, and then fills the map structure based on those.
    // The client expects this as a separate message.
    let packet = this.map.dump({noPills: true, noBases: true});
    packet = Buffer.from(packet).toString('base64');
    ws.send(packet);

    // To synchronize the object list to the client, we simulate creation of all objects.
    // Then, we tell the client which tank is his, using the welcome message.
    packet = [];
    for (var obj of Array.from(this.objects)) {
      packet = packet.concat([net.CREATE_MESSAGE, obj._net_type_idx]);
    }
    packet = packet.concat([net.UPDATE_MESSAGE], this.dumpTick(true));
    packet = Buffer.from(packet).toString('base64');
    ws.send(packet);

    // Synchronize all player names.
    let messages = Array.from(this.tanks).map((tank) => (
      { command: 'nick', idx: tank.idx, nick: tank.name }));
    messages = JSON.stringify(messages);
    ws.send(messages);

    // Finish with a 'sync' message.
    packet = Buffer.from([net.SYNC_MESSAGE]).toString('base64');
    return ws.send(packet);
  }

  onEnd(ws, code, reason) {
    let idx;
    if (ws.tank) { this.destroy(ws.tank); }
    ws.tank = null;
    if ((idx = this.clients.indexOf(ws)) !== -1) {
      this.clients.splice(idx, 1);
    }
    return ws.close();
  }

  onMessage(ws, message) {
    if (message === '') { return ws.heartbeatTimer = 0;
    } else if (message.charAt(0) === '{') { return this.onJsonMessage(ws, message);
    } else { return this.onSimpleMessage(ws, message); }
  }

  onSimpleMessage(ws, message) {
    let tank;
    if (!(tank = ws.tank)) {
      return this.onError(ws, new Error("Received a game command from a spectator"));
    }
    const command = message.charAt(0);
    switch (command) {
      case net.START_TURNING_CCW:  return tank.turningCounterClockwise = true;
      case net.STOP_TURNING_CCW:   return tank.turningCounterClockwise = false;
      case net.START_TURNING_CW:   return tank.turningClockwise = true;
      case net.STOP_TURNING_CW:    return tank.turningClockwise = false;
      case net.START_ACCELERATING: return tank.accelerating = true;
      case net.STOP_ACCELERATING:  return tank.accelerating = false;
      case net.START_BRAKING:      return tank.braking = true;
      case net.STOP_BRAKING:       return tank.braking = false;
      case net.START_SHOOTING:     return tank.shooting = true;
      case net.STOP_SHOOTING:      return tank.shooting = false;
      case net.INC_RANGE:          return tank.increaseRange();
      case net.DEC_RANGE:          return tank.decreaseRange();
      case net.BUILD_ORDER:
        var [action, trees, x, y] = Array.from(message.slice(2).split(','));
        trees = parseInt(trees); x = parseInt(x); y = parseInt(y);
        var builder = tank.builder.$;
        if ((trees < 0) || !builder.states.actions.hasOwnProperty(action)) {
          return this.onError(ws, new Error("Received invalid build order"));
        } else {
          return builder.performOrder(action, trees, this.map.cellAtTile(x, y));
        }
      default:
        var sanitized = command.replace(/\W+/, '');
        return this.onError(ws, new Error(`Received an unknown command: ${sanitized}`));
    }
  }

  onJsonMessage(ws, message) {
    let tank;
    try {
      message = JSON.parse(message);
      if (typeof(message.command) !== 'string') {
        throw new Error("Received an invalid JSON message");
      }
    } catch (e) {
      return this.onError(ws, e);
    }
    if (message.command === 'join') {
      if (ws.tank) {
        this.onError(ws, new Error("Client tried to join twice."));
      } else {
        this.onJoinMessage(ws, message);
      }
      return;
    }
    if (!(tank = ws.tank)) {
      return this.onError(ws, new Error("Received a JSON message from a spectator"));
    }
    switch (message.command) {
      case 'msg':     return this.onTextMessage(ws, tank, message);
      case 'teamMsg': return this.onTeamTextMessage(ws, tank, message);
      default:
        var sanitized = message.command.slice(0, 10).replace(/\W+/, '');
        return this.onError(ws, new Error(`Received an unknown JSON command: ${sanitized}`));
    }
  }

  // Creates a tank for a connection and synchronizes it to everyone. Then tells the connection
  // that this new tank is his.
  onJoinMessage(ws, message) {
    if ((typeof(message.nick) !== 'string') || (message.nick.length > 20)) {
      this.onError(ws, new Error("Client specified invalid nickname."));
    }
    if ((typeof(message.team) !== 'number') || !((message.team === 0) || (message.team === 1))) {
      this.onError(ws, new Error("Client specified invalid team."));
    }

    ws.tank = this.spawn(Tank, message.team);
    let packet = this.changesPacket(true);
    packet = Buffer.from(packet).toString('base64');
    this.broadcast(packet);

    ws.tank.name = message.name;
    this.broadcast(JSON.stringify({
      command: 'nick',
      idx: ws.tank.idx,
      nick: message.nick
    })
    );

    packet = pack('BH', net.WELCOME_MESSAGE, ws.tank.idx);
    packet = Buffer.from(packet).toString('base64');
    return ws.send(packet);
  }

  onTextMessage(ws, tank, message) {
    if ((typeof(message.text) !== 'string') || (message.text.length > 140)) {
      this.onError(ws, new Error("Client sent an invalid text message."));
    }

    return this.broadcast(JSON.stringify({
      command: 'msg',
      idx: tank.idx,
      text: message.text
    })
    );
  }

  onTeamTextMessage(ws, tank, message) {
    if ((typeof(message.text) !== 'string') || (message.text.length > 140)) {
      this.onError(ws, new Error("Client sent an invalid text message."));
    }
    if (tank.team === 255) { return; }

    const out = JSON.stringify({
      command: 'teamMsg',
      idx: tank.idx,
      text: message.text
    });
    return Array.from(this.clients).filter((client) => client.tank.team === tank.team).map((client) =>
      client.send(out));
  }

  //### Helpers

  // Simple helper to send a message to everyone.
  broadcast(message) {
    return Array.from(this.clients).map((client) =>
      client.send(message));
  }

  // We send critical updates every frame, and non-critical updates every other frame. On top of
  // that, non-critical updates may be dropped, if the client's hearbeats are interrupted.
  sendPackets() {
    let largePacket, smallPacket;
    if (this.oddTick = !this.oddTick) {
      smallPacket = this.changesPacket(true);
      smallPacket = Buffer.from(smallPacket).toString('base64');
      largePacket = smallPacket;
    } else {
      smallPacket = this.changesPacket(false);
      largePacket = smallPacket.concat(this.updatePacket());
      smallPacket = Buffer.from(smallPacket).toString('base64');
      largePacket = Buffer.from(largePacket).toString('base64');
    }

    return (() => {
      const result = [];
      for (var client of Array.from(this.clients)) {
        if (client.heartbeatTimer > 40) {
          result.push(client.send(smallPacket));
        } else {
          client.send(largePacket);
          result.push(client.heartbeatTimer++);
        }
      }
      return result;
    })();
  }

  // Get a data stream for critical updates. The optional `fullCreate` flag is used to transmit
  // create messages that include state, which is needed when not followed by an update packet.
  changesPacket(fullCreate) {
    let idx, obj;
    if (!(this.changes.length > 0)) { return []; }

    let data = [];
    const needUpdate = [];

    for (var change of Array.from(this.changes)) {
      var ownerIdx, sfx;
      var type = change.shift();

      switch (type) {
        case 'create':
          [obj, idx] = Array.from(change);
          if (fullCreate) { needUpdate.push(obj); }
          data = data.concat([net.CREATE_MESSAGE], pack('B', obj._net_type_idx));
          break;

        case 'destroy':
          [obj, idx] = Array.from(change);
          for (var i = 0; i < needUpdate.length; i++) {
            var other = needUpdate[i];
            if (other === obj) {
              needUpdate.splice(i, 1);
              break;
            }
          }
          data = data.concat([net.DESTROY_MESSAGE], pack('H', idx));
          break;

        case 'mapChange':
          var [x, y, ascii, life, mine] = Array.from(change);
          var asciiCode = ascii.charCodeAt(0);
          data = data.concat([net.MAPCHANGE_MESSAGE], pack('BBBBf', x, y, asciiCode, life, mine));
          break;

        case 'soundEffect':
          [sfx, x, y, ownerIdx] = Array.from(change);
          data = data.concat([net.SOUNDEFFECT_MESSAGE], pack('BHHH', sfx, x, y, ownerIdx));
          break;
      }
    }

    for (obj of Array.from(needUpdate)) {
      data = data.concat([net.TINY_UPDATE_MESSAGE], pack('H', obj.idx), this.dump(obj));
    }

    return data;
  }

  // Get a data stream for non-critical updates.
  updatePacket() { return [net.UPDATE_MESSAGE].concat(this.dumpTick()); }
}
BoloServerWorld.initClass();

helpers.extend(BoloServerWorld.prototype, BoloWorldMixin);
allObjects.registerWithWorld(BoloServerWorld.prototype);


//# HTTP server application
class Application {

  constructor(options) {
    this.tick = this.tick.bind(this);
    if (options == null) { options = {}; }
    this.options = options;
    const webroot = path.join(path.dirname(fs.realpathSync(__filename)), '../../');

      this.connectServer = connect();
      if (this.options.web != null ? this.options.web.log : undefined) {
        const morgan = require('morgan');
        this.connectServer.use(morgan('dev'));
      }
      this.connectServer.use('/', redirector(this.options.general.base));
      const serveStatic = require('serve-static');
      this.connectServer.use('/', serveStatic(webroot));

    this.games = {};
    this.ircClients = [];

    const mapPath = path.join(path.dirname(fs.realpathSync(__filename)), '../../maps');
    this.maps = new MapIndex(mapPath, () => {
      return this.resetDemo(function(err) {
        if (err) { return console.log(err); }
      });
    });

    this.loop = createLoop({rate: TICK_LENGTH_MS, tick: this.tick});
  }

  // FIXME: this is for the demo
  resetDemo(cb) {
    let everard;
    if (this.demo) { this.closeGame(this.demo); }
    if (!(everard = this.maps.get('Everard Island'))) {
      return (typeof cb === 'function' ? cb("Could not find Everard Island.") : undefined);
    }
    return fs.readFile(everard.path, (err, data) => {
      if (err) { return (typeof cb === 'function' ? cb(`Unable to start demo game: ${err.toString()}`) : undefined); }
      this.demo = this.createGame(data);
      return (typeof cb === 'function' ? cb() : undefined);
    });
  }

  haveOpenSlots() {
    return Object.getOwnPropertyNames(this.games).length < this.options.general.maxgames;
  }

  createGameId() {
    let gid;
    const charset = 'abcdefghijklmnopqrstuvwxyz';
    while (true) {
      gid = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map((i) =>
        charset.charAt(round(random() * (charset.length - 1))));
      gid = gid.join('');
      if (!this.games.hasOwnProperty(gid)) { break; }
    }
    return gid;
  }

  createGame(mapData) {
    let game;
    const map = WorldMap.load(mapData);

    const gid = this.createGameId();
    this.games[gid] = (game = new BoloServerWorld(map));
    game.gid = gid;
    game.url = `${this.options.general.base}/match/${gid}`;
    console.log(`Created game '${gid}'`);
    this.startLoop();

    return game;
  }

  closeGame(game) {
    delete this.games[game.gid];
    this.possiblyStopLoop();
    game.close();
    return console.log(`Closed game '${game.gid}'`);
  }

  registerIrcClient(irc) {
    return this.ircClients.push(irc);
  }

  listen() {
    this.httpServer = this.connectServer.listen.apply(this.connectServer, arguments);

    // FIXME: There's no good way to deal with upgrades in Connect, yet. (issue #61)
    // (Servers that wrap this application will fail.)
    return this.httpServer.on('upgrade', (request, connection, initialData) => {
      return this.handleWebsocket(request, connection, initialData);
    });
  }

  shutdown() {
    for (var client of Array.from(this.ircClients)) {
      client.shutdown();
    }
    for (var gid in this.games) {
      var game = this.games[gid];
      game.close();
    }
    this.loop.stop();
    return this.httpServer.close();
  }

  //### Loop control

  startLoop() {
    return this.loop.start();
  }

  possiblyStopLoop() {
    if (!this.haveOpenSlots()) { return this.loop.stop(); }
  }

  tick() {
    for (var gid in this.games) {
      var game = this.games[gid];
      game.tick();
    }
  }

  //### WebSocket handling

  // Determine what will handle a WebSocket's 'connect' event, based on the requested resource.
  getSocketPathHandler(path) {
    // FIXME: Simple lobby with chat and match making.
    let m;
    if (path === '/lobby') { return false;

    // FIXME: Match joining based on a UUID.
    } else if ((m = /^\/match\/([a-z]{20})$/.exec(path))) {
      if (this.games.hasOwnProperty(m[1])) {
        return ws => this.games[m[1]].onConnect(ws);
      } else {
        return false;
      }

    // FIXME: This is the temporary entry point.
    } else if ((path === '/demo') && this.demo) { return ws => this.demo.onConnect(ws);

    } else { return false; }
  }

  // Handle the 'upgrade' event.
  handleWebsocket(request, connection, initialData) {
    if (request.method !== 'GET') { return connection.destroy(); }

    path = request.url;
    const handler = this.getSocketPathHandler(path);
    if (handler === false) { return connection.destroy(); }

    const ws = new WebSocket(request, connection, initialData);
    return handler(ws);
  }
}


//# Entry point

// Helper middleware to redirect from '/match/*'.
var redirector = base => (function(req, res, next) {
  let m, query;
  if (m = /^\/match\/([a-z]{20})$/.exec(req.url)) {
    query = `?${m[1]}`;
  } else {
    return next();
  }
  res.writeHead(301, {'Location': `${base}/${query}`});
  return res.end();
});

// Don't export a server directly, but this factory function. Once called, the timer loop will
// start. I believe it's untidy to have timer loops start after a simple require().
const createBoloApp = options => new Application(options);


//# Exports
module.exports = createBoloApp;

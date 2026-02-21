/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS201: Simplify complex destructure assignments
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
const ClientWorld      = require('villain/world/net/client');
const WorldMap         = require('../../world_map');
const allObjects       = require('../../objects/all');
const WorldPillbox     = require('../../objects/world_pillbox');
const WorldBase        = require('../../objects/world_base');
const {unpack}         = require('../../struct');
const {decodeBase64}   = require('../base64');
const net              = require('../../net');
const helpers          = require('../../helpers');

// FIXME: Better error handling all around.


const JOIN_DIALOG_TEMPLATE = `\
<div id="join-dialog">
  <div>
    <p>What is your name?</p>
    <p><input type="text" id="join-nick-field" name="join-nick-field" maxlength=20></input></p>
  </div>
  <div id="join-team">
    <p>Choose a side:</p>
    <p>
      <input type="radio" id="join-team-red" name="join-team" value="red"></input>
      <label for="join-team-red"><span class="bolo-team bolo-team-red"></span></label>
      <input type="radio" id="join-team-blue" name="join-team" value="blue"></input>
      <label for="join-team-blue"><span class="bolo-team bolo-team-blue"></span></label>
    </p>
  </div>
  <div>
    <p><input type="button" name="join-submit" id="join-submit" value="Join game"></input></p>
  </div>
</div>\
`;


//# Networked game

// The `BoloClientWorld` class implements a networked game using a WebSocket.

class BoloClientWorld extends ClientWorld {
  static initClass() {
  
    this.prototype.authority = false;
  }

  constructor() {
    super(...arguments);
    this.mapChanges = {};
    this.processingServerMessages = false;
  }

  // Callback after resources have been loaded.
  loaded(vignette) {
    let m, path;
    this.vignette = vignette;
    this.vignette.message('Connecting to the multiplayer game');
    this.heartbeatTimer = 0;

    if (m = /^\?([a-z]{20})$/.exec(location.search)) {
      path = `/match/${m[1]}`;
    } else if (location.search) {
      return this.vignette.message('Invalid game ID');
    } else {
      path = "/demo";
    }
    this.ws = new WebSocket(`ws://${location.host}${path}`);
    const ws = $(this.ws);
    ws.one('open.bolo', () => {
      return this.connected();
    });
    return ws.one('close.bolo', () => {
      return this.failure('Connection lost');
    });
  }

  connected() {
    this.vignette.message('Waiting for the game map');
    const ws = $(this.ws);
    return ws.one('message.bolo', e => {
      return this.receiveMap(e.originalEvent);
    });
  }

  // Callback after the map was received.
  receiveMap(e) {
    this.map = WorldMap.load(decodeBase64(e.data));
    this.commonInitialization();
    this.vignette.message('Waiting for the game state');
    return $(this.ws).bind('message.bolo', e => {
      return this.handleMessage(e.originalEvent);
    });
  }

  // Callback after the server tells us we are synchronized.
  synchronized() {
    let blue;
    this.rebuildMapObjects();
    this.vignette.destroy();
    this.vignette = null;
    this.loop.start();

    let red = (blue = 0);
    for (var tank of Array.from(this.tanks)) {
      if (tank.team === 0) { red++; }
      if (tank.team === 1) { blue++; }
    }
    const disadvantaged = blue < red ? 'blue' : 'red';

    this.joinDialog = $(JOIN_DIALOG_TEMPLATE).dialog({dialogClass: 'unclosable'});
    return this.joinDialog
      .find('#join-nick-field')
        .val($.cookie('nick') || '')
        .focus()
        .keydown(e => {
          if (e.which === 13) { return this.join(); }
      }).end()
      .find(`#join-team-${disadvantaged}`)
        .attr('checked', 'checked')
      .end()
      .find("#join-team")
        .buttonset()
      .end()
      .find('#join-submit')
        .button()
        .click(() => {
          return this.join();
    });
  }

  join() {
    const nick = this.joinDialog.find('#join-nick-field').val();
    let team = this.joinDialog.find('#join-team input[checked]').val();
    team = (() => { switch (team) {
      case 'red':  return 0;
      case 'blue': return 1;
      default: return -1;
    } })();
    if (!nick || (team === -1)) { return; }

    $.cookie('nick', nick);
    this.joinDialog.dialog('destroy'); this.joinDialog = null;
    this.ws.send(JSON.stringify({ command: 'join', nick, team }));
    return this.input.focus();
  }

  // Callback after the welcome message was received.
  receiveWelcome(tank) {
    this.player = tank;
    this.renderer.initHud();
    return this.initChat();
  }

  // Send the heartbeat (an empty message) every 10 ticks / 400ms.
  tick() {
    super.tick(...arguments);

    if (this.increasingRange !== this.decreasingRange) {
      if (++this.rangeAdjustTimer === 6) {
        if (this.increasingRange) { this.ws.send(net.INC_RANGE);
        } else { this.ws.send(net.DEC_RANGE); }
        this.rangeAdjustTimer = 0;
      }
    } else {
      this.rangeAdjustTimer = 0;
    }

    if (++this.heartbeatTimer === 10) {
      this.heartbeatTimer = 0;
      return this.ws.send('');
    }
  }

  failure(message) {
    if (this.ws) {
      this.ws.close();
      $(this.ws).unbind('.bolo');
      this.ws = null;
    }
    return super.failure(...arguments);
  }

  // On the client, this is a no-op.
  soundEffect(sfx, x, y, owner) {}

  // Keep track of map changes that we made locally. We only remember the last state of a cell
  // that the server told us about, so we can restore it to that state before processing
  // server updates.
  mapChanged(cell, oldType, hadMine, oldLife) {
    if (this.processingServerMessages) { return; }
    if (this.mapChanges[cell.idx] == null) {
      cell._net_oldType = oldType;
      cell._net_hadMine = hadMine;
      cell._net_oldLife = oldLife;
      this.mapChanges[cell.idx] = cell;
    }
  }

  //### Chat handlers

  initChat() {
    this.chatMessages = $('<div/>', {id: 'chat-messages'}).appendTo(this.renderer.hud);
    this.chatContainer = $('<div/>', {id: 'chat-input'}).appendTo(this.renderer.hud).hide();
    return this.chatInput = $('<input/>', {type: 'text', name: 'chat', maxlength: 140})
      .appendTo(this.chatContainer).keydown(e => this.handleChatKeydown(e));
  }

  openChat(options) {
    if (!options) { options = {}; }
    this.chatContainer.show();
    return this.chatInput.val('').focus().team = options.team;
  }

  commitChat() {
    this.ws.send(JSON.stringify({
      command: this.chatInput.team ? 'teamMsg' : 'msg',
      text: this.chatInput.val()
    })
    );
    return this.closeChat();
  }

  closeChat() {
    this.chatContainer.hide();
    return this.input.focus();
  }

  receiveChat(who, text, options) {
    if (!options) { options = {}; }
    const element =
      options.team ?
        $('<p/>', {class: 'msg-team'}).text(`<${who.name}> ${text}`)
      :
        // FIXME: Style the name according to team, but the palette colors might not be readable.
        $('<p/>', {class: 'msg'}).text(`<${who.name}> ${text}`);
    this.chatMessages.append(element);
    return window.setTimeout(() => {
      return element.remove();
    }
    , 7000);
  }

  //### Input handlers.

  handleKeydown(e) {
    if (!this.ws || !this.player) { return; }
    switch (e.which) {
      case 32: return this.ws.send(net.START_SHOOTING);
      case 37: return this.ws.send(net.START_TURNING_CCW);
      case 38: return this.ws.send(net.START_ACCELERATING);
      case 39: return this.ws.send(net.START_TURNING_CW);
      case 40: return this.ws.send(net.START_BRAKING);
      case 84: return this.openChat();
      case 82: return this.openChat({team: true});
    }
  }

  handleKeyup(e) {
    if (!this.ws || !this.player) { return; }
    switch (e.which) {
      case 32: return this.ws.send(net.STOP_SHOOTING);
      case 37: return this.ws.send(net.STOP_TURNING_CCW);
      case 38: return this.ws.send(net.STOP_ACCELERATING);
      case 39: return this.ws.send(net.STOP_TURNING_CW);
      case 40: return this.ws.send(net.STOP_BRAKING);
    }
  }

  handleChatKeydown(e) {
    if (!this.ws || !this.player) { return; }
    switch (e.which) {
      case 13: this.commitChat(); break;
      case 27: this.closeChat(); break;
      default: return;
    }
    return e.preventDefault();
  }

  buildOrder(action, trees, cell) {
    if (!this.ws || !this.player) { return; }
    if (!trees) { trees = 0; }
    return this.ws.send([net.BUILD_ORDER, action, trees, cell.x, cell.y].join(','));
  }

  //### Network message handlers.

  handleMessage(e) {
    let data;
    let error = null;
    if (e.data.charAt(0) === '{') {
      try {
        this.handleJsonCommand(JSON.parse(e.data));
      } catch (error1) {
        e = error1;
        error = e;
      }
    } else if (e.data.charAt(0) === '[') {
      try {
        for (var message of Array.from(JSON.parse(e.data))) {
          this.handleJsonCommand(message);
        }
      } catch (error2) {
        e = error2;
        error = e;
      }
    } else {
      this.netRestore();
      try {
        data = decodeBase64(e.data);
        let pos = 0;
        const {
          length
        } = data;
        this.processingServerMessages = true;
        while (pos < length) {
          var command = data[pos++];
          var ate = this.handleBinaryCommand(command, data, pos);
          pos += ate;
        }
        this.processingServerMessages = false;
        if (pos !== length) {
          error = new Error(`Message length mismatch, processed ${pos} out of ${length} bytes`);
        }
      } catch (error3) {
        e = error3;
        error = e;
      }
    }
    if (error) {
      this.failure('Connection lost (protocol error)');
      if (typeof console !== 'undefined' && console !== null) {
        console.log("Following exception occurred while processing message:", e.data);
      }
      throw error;
    }
  }

  handleBinaryCommand(command, data, offset) {
    let array1, array2, array3, code, idx, life, mine, owner, sfx, x, y;
    switch (command) {
      case net.SYNC_MESSAGE:
        this.synchronized();
        return 0;

      case net.WELCOME_MESSAGE:
        var array = unpack('H', data, offset), [tank_idx] = Array.from(array[0]), bytes = array[1];
        this.receiveWelcome(this.objects[tank_idx]);
        return bytes;

      case net.CREATE_MESSAGE:
        return this.netSpawn(data, offset);

      case net.DESTROY_MESSAGE:
        return this.netDestroy(data, offset);

      case net.MAPCHANGE_MESSAGE:
        array1 = unpack('BBBBf', data, offset),
          [x, y, code, life, mine] = Array.from(array1[0]),
          bytes = array1[1];
        var ascii = String.fromCharCode(code);
        var cell = this.map.cells[y][x];
        cell.setType(ascii, mine);
        cell.life = life;
        return bytes;

      case net.SOUNDEFFECT_MESSAGE:
        array2 = unpack('BHHH', data, offset), [sfx, x, y, owner] = Array.from(array2[0]), bytes = array2[1];
        this.renderer.playSound(sfx, x, y, this.objects[owner]);
        return bytes;

      case net.TINY_UPDATE_MESSAGE:
        array3 = unpack('H', data, offset), [idx] = Array.from(array3[0]), bytes = array3[1];
        bytes += this.netUpdate(this.objects[idx], data, offset + bytes);
        return bytes;

      case net.UPDATE_MESSAGE:
        return this.netTick(data, offset);

      default:
        throw new Error(`Bad command '${command}' from server, at offset ${offset - 1}`);
    }
  }

  handleJsonCommand(data) {
    switch (data.command) {
      case 'nick':
        return this.objects[data.idx].name = data.nick;
      case 'msg':
        return this.receiveChat(this.objects[data.idx], data.text);
      case 'teamMsg':
        return this.receiveChat(this.objects[data.idx], data.text, {team: true});
      default:
        throw new Error(`Bad JSON command '${data.command}' from server.`);
    }
  }

  //### Helpers

  // Fill `@map.pills` and `@map.bases` based on the current object list.
  rebuildMapObjects() {
    this.map.pills = []; this.map.bases = [];
    for (var obj of Array.from(this.objects)) {
      if      (obj instanceof WorldPillbox) { this.map.pills.push(obj);
      } else if (obj instanceof WorldBase) {    this.map.bases.push(obj);
      } else { continue; }
      if (obj.cell != null) {
        obj.cell.retile();
      }
    }
  }

  // Override that reverts map changes as well.
  netRestore() {
    super.netRestore(...arguments);
    for (var idx in this.mapChanges) {
      var cell = this.mapChanges[idx];
      cell.setType(cell._net_oldType, cell._net_hadMine);
      cell.life = cell._net_oldLife;
    }
    return this.mapChanges = {};
  }
}
BoloClientWorld.initClass();

helpers.extend(BoloClientWorld.prototype, require('./mixin'));
allObjects.registerWithWorld(BoloClientWorld.prototype);


//# Exports
module.exports = BoloClientWorld;

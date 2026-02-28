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
const $                = require('../../dom');
const { SettingsManager, DEFAULT_KEY_MAPPINGS, KEY_DISPLAY_NAMES } = require('../settings');

function createModal(content, options = {}) {
  const overlay = $.create('div', { class: 'fixed inset-0 bg-black/70 z-50 flex items-center justify-center' });
  const dialog = document.createElement('div');
  dialog.className = 'bg-gray-800 rounded-lg shadow-2xl p-6 min-w-[320px] max-w-md border border-gray-700';
  dialog.innerHTML = content;
  
  if (options.title) {
    const title = document.createElement('h2');
    title.className = 'text-xl font-bold text-gray-100 mb-4';
    title.textContent = options.title;
    dialog.prepend(title);
  }
  
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  
  const wrap = (el) => {
    if (!el) return {
      focus: () => {},
      keydown: () => {},
      click: () => {},
      addEventListener: () => {},
      get 0() { return null; }
    };
    return {
      focus: () => { el.focus(); return wrap(el); },
      keydown: (fn) => { el.addEventListener('keydown', fn); return wrap(el); },
      click: (fn) => { el.addEventListener('click', fn); return wrap(el); },
      addEventListener: (evt, fn) => { el.addEventListener(evt, fn); return wrap(el); },
      get value() { return el.value; },
      set value(v) { el.value = v; },
      get innerHTML() { return el.innerHTML; },
      set innerHTML(v) { el.innerHTML = v; },
      get textContent() { return el.textContent; },
      set textContent(v) { el.textContent = v; },
      get checked() { return el.checked; },
      set checked(v) { el.checked = v; },
      get parentElement() { return wrap(el.parentElement); },
      querySelector: (s) => wrap(el.querySelector(s)),
      get classList() { return el.classList; },
      get 0() { return el; }
    };
  };
  
  const api = {
    find: (selector) => wrap(dialog.querySelector(selector)),
    findAll: (selector) => {
      const els = dialog.querySelectorAll(selector);
      return Array.from(els).map(el => wrap(el));
    },
    close: () => {
      overlay.remove();
      if (options.onClose) options.onClose();
    }
  };
  
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay && !options.persistent) {
      api.close();
    }
  });
  
  return api;
}

// FIXME: Better error handling all around.


const JOIN_DIALOG_TEMPLATE = `
<div>
  <p class="text-gray-300 mb-3">What is your name?</p>
  <input type="text" id="join-nick-field" name="join-nick-field" maxlength=20 autoComplete="off"
         class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white mb-4 focus:outline-none focus:border-blue-500"></input>
  <p class="text-gray-300 mb-2">Choose a side:</p>
  <div id="join-team" class="flex gap-4 mb-4">
    <label class="flex items-center cursor-pointer p-2">
      <input type="radio" id="join-team-red" name="join-team" value="red" class="sr-only">
      <span class="w-8 h-8 rounded-full bg-red-600 border-2 border-transparent hover:border-white transition-colors team-radio team-radio-red"></span>
      <span class="ml-2 text-gray-300">Red</span>
    </label>
    <label class="flex items-center cursor-pointer p-2">
      <input type="radio" id="join-team-blue" name="join-team" value="blue" class="sr-only">
      <span class="w-8 h-8 rounded-full bg-blue-600 border-2 border-transparent hover:border-white transition-colors team-radio team-radio-blue"></span>
      <span class="ml-2 text-gray-300">Blue</span>
    </label>
  </div>
  <button id="join-submit" class="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium transition-colors">Join Game</button>
</div>`;


const LAUNCH_TEMPLATE = `
<div>
  <p class="text-gray-300 mb-4">Create a new game, or join with a game code.</p>
  <input type="text" id="join-code-field" name="join-code-field" 
         class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white mb-4 focus:outline-none focus:border-blue-500" 
         maxlength=6 placeholder="e.g. a3f1c9"></input>
  <div class="flex gap-3">
    <button id="join-code-submit" class="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium transition-colors">Join</button>
    <button id="create-game-submit" class="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded font-medium transition-colors">Create Game</button>
  </div>
</div>`;


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

    this.settingsManager = new SettingsManager();
    if (this.soundkit) {
      this.soundkit.setVolume(this.settingsManager.getVolume());
    }

    // If a 6-digit hex id is present in the querystring, connect to that match.
    if (m = /^\?([0-9a-f]{6})$/.exec(location.search)) {
      path = `/match/${m[1]}`;
      const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      this.ws = new WebSocket(`${wsProtocol}//${location.host}${path}`);
      this.ws.addEventListener('open', () => { return this.connected(); });
      this.ws.addEventListener('close', () => { return this.failure('Connection lost'); });
      return;
    }

    // If an invalid querystring exists, show message.
    if (location.search) { return this.vignette.message('Invalid game ID'); }

    // Otherwise present a launch dialog allowing create/join by code.
    this.vignette.message('Choose Create or Join');
    this.launchDialog = createModal(LAUNCH_TEMPLATE, { persistent: true });
    this.launchDialog.find('#join-code-field').focus();
    this.launchDialog.find('#join-code-field').keydown(e => { if (e.which === 13) { this.launchJoin(); } });
    this.launchDialog.find('#join-code-submit').click(() => { return this.launchJoin(); });
    this.launchDialog.find('#create-game-submit').click(() => { return this.launchCreate(); });
  }

  launchJoin() {
    const code = (this.launchDialog.find('#join-code-field').val() || '').toLowerCase();
    if (!/^[0-9a-f]{6}$/.test(code)) { return this.vignette.message('Invalid code'); }
    // Navigate to the game query param; reload will trigger the websocket connect.
    return location.search = `?${code}`;
  }

  launchCreate() {
    this.vignette.message('Creating game...');
    // Call server /create endpoint to create a game and receive gid.
    return fetch('/create').then(res => res.json()).then(data => {
      if (data && data.gid) { location.search = `?${data.gid}`; }
      else { this.vignette.message('Create failed'); }
    }).catch(() => { return this.vignette.message('Create failed'); });
  }

  connected() {
    this.vignette.message('Waiting for the game map');
    const oneTimeHandler = (e) => {
      this.ws.removeEventListener('message', oneTimeHandler);
      return this.receiveMap(e);
    };
    this.ws.addEventListener('message', oneTimeHandler);
  }

  // Callback after the map was received.
  receiveMap(e) {
    this.map = WorldMap.load(decodeBase64(e.data));
    this.commonInitialization();
    this.vignette.message('Waiting for the game state');
    this._messageHandler = (e) => {
      return this.handleMessage(e);
    };
    this.ws.addEventListener('message', this._messageHandler);
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

    this.joinDialog = createModal(JOIN_DIALOG_TEMPLATE, { persistent: true });
    const nickField = this.joinDialog.find('#join-nick-field');
    nickField.value = $.cookie.get('nick') || '';
    nickField.focus();
    nickField.addEventListener('keydown', e => {
      if (e.which === 13) { return this.join(); }
    });
    
    const teamRadio = this.joinDialog.find(`#join-team-${disadvantaged}`);
    teamRadio.checked = true;
    teamRadio.parentElement.querySelector('.team-radio').classList.add('border-white');
    
    this.joinDialog.find('#join-submit').addEventListener('click', () => {
      return this.join();
    });
  }

  join() {
    const nick = this.joinDialog.find('#join-nick-field').value;
    let team = this.joinDialog.find('#join-team input:checked').value;
    team = (() => { switch (team) {
      case 'red':  return 0;
      case 'blue': return 1;
      default: return -1;
    } })();
    if (!nick || (team === -1)) { return; }

    $.cookie.set('nick', nick);
    this.joinDialog.close(); this.joinDialog = null;
    this.ws.send(JSON.stringify({ command: 'join', nick, team }));
    return this.input.focus();
  }

  // Callback after the welcome message was received.
  receiveWelcome(tank) {
    this.player = tank;
    this.renderer.initHud();
    this.initChat();
    return this.map.retile();
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
      if (this._messageHandler) {
        this.ws.removeEventListener('message', this._messageHandler);
      }
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
    this.chatMessages = $.create('div', { id: 'chat-messages' });
    this.renderer.hud.appendChild(this.chatMessages);
    this.chatContainer = $.create('div', { id: 'chat-input' });
    this.chatContainer.style.display = 'none';
    this.renderer.hud.appendChild(this.chatContainer);
    this.chatInput = $.create('input', { type: 'text', name: 'chat', maxlength: 140 });
    this.chatContainer.appendChild(this.chatInput);
    this.chatInput.addEventListener('keydown', (e) => this.handleChatKeydown(e));
  }

  openChat(options) {
    if (!options) { options = {}; }
    this.chatContainer.style.display = 'block';
    this.chatInput.value = '';
    this.chatInput.focus();
    this.chatInput.team = options.team;
  }

  commitChat() {
    this.ws.send(JSON.stringify({
      command: this.chatInput.team ? 'teamMsg' : 'msg',
      text: this.chatInput.value
    })
    );
    return this.closeChat();
  }

  closeChat() {
    this.chatContainer.style.display = 'none';
    return this.input.focus();
  }

  receiveChat(who, text, options) {
    if (!options) { options = {}; }
    const element = document.createElement('p');
    element.className = options.team ? 'msg-team' : 'msg';
    element.textContent = `<${who.name}> ${text}`;
    this.chatMessages.appendChild(element);
    return window.setTimeout(() => {
      return element.remove();
    }
    , 7000);
  }

  //### Input handlers.

  handleKeydown(e) {
    if (!this.ws || !this.player) { return; }
    const action = this.settingsManager ? this.settingsManager.getReverseKeyCode(e.which) : null;
    switch (action || e.which) {
      case 'up':
      case 38: return this.ws.send(net.START_ACCELERATING);
      case 'down':
      case 40: return this.ws.send(net.START_BRAKING);
      case 'left':
      case 37: return this.ws.send(net.START_TURNING_CCW);
      case 'right':
      case 39: return this.ws.send(net.START_TURNING_CW);
      case 'fire':
      case 32: return this.ws.send(net.START_SHOOTING);
      case 'build': return this.player.builder.select('wall');
      case 'dropMine': return this.player.builder.select('mine');
      case 'chat':
      case 't':
      case 84: return this.openChat();
      case 'r':
      case 82: return this.openChat({team: true});
    }
  }

  handleKeyup(e) {
    if (!this.ws || !this.player) { return; }
    const action = this.settingsManager ? this.settingsManager.getReverseKeyCode(e.which) : null;
    switch (action || e.which) {
      case 'up':
      case 38: return this.ws.send(net.STOP_ACCELERATING);
      case 'down':
      case 40: return this.ws.send(net.STOP_BRAKING);
      case 'left':
      case 37: return this.ws.send(net.STOP_TURNING_CCW);
      case 'right':
      case 39: return this.ws.send(net.STOP_TURNING_CW);
      case 'fire':
      case 32: return this.ws.send(net.STOP_SHOOTING);
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
    let array1, array2, array3, code, idx, life, mine, mineOwner, owner, sfx, x, y;
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
        array1 = unpack('BBBBBB', data, offset),
          [x, y, code, life, mine, mineOwner] = Array.from(array1[0]),
          bytes = array1[1];
        var ascii = String.fromCharCode(code);
        var cell = this.map.cells[y][x];
        cell.mineOwner = mineOwner;
        cell.setType(ascii, mine ? true : false);
        cell.life = life;
        return bytes;

      case net.SOUNDEFFECT_MESSAGE:
        array2 = unpack('BHHH', data, offset), [sfx, x, y, owner] = Array.from(array2[0]), bytes = array2[1];
        this.renderer.playSound(sfx, x, y, this.objects[owner]);
        return bytes;

      case net.MINEOWNER_MESSAGE:
        {
          let startOffset = offset;
          while (offset < data.length) {
            array2 = unpack('BBB', data, offset), [x, y, mineOwner] = Array.from(array2[0]), bytes = array2[1];
            this.map.cells[y][x].mineOwner = mineOwner;
            this.map.cells[y][x].retile();
            offset += bytes;
          }
          return offset - startOffset;
        }

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

  showSettings() {
    if (this.settingsDialog) {
      this.settingsDialog.close();
      this.settingsDialog = null;
      return;
    }

    if (!this.settingsManager) {
      this.settingsManager = new SettingsManager();
    }

    const actions = Object.keys(DEFAULT_KEY_MAPPINGS);
    let rowsHtml = '';
    for (const action of actions) {
      const currentKey = this.settingsManager.getKeyMapping(action);
      const displayName = KEY_DISPLAY_NAMES[action] || action;
      rowsHtml += `
        <div class="settings-row">
          <span class="settings-label">${displayName}</span>
          <span class="settings-default">${DEFAULT_KEY_MAPPINGS[action]}</span>
          <input type="text" class="settings-override" data-action="${action}" value="${currentKey}" maxlength="20" placeholder="Override">
        </div>
      `;
    }

    const currentVolume = Math.round((this.settingsManager.getVolume() || 0.5) * 100);
    const content = `
    <div class="settings-wrapper">
      <div class="settings-content">
        <div class="settings-section">
          <div class="settings-section-title">Volume</div>
          <div class="settings-volume">
            <input type="range" class="settings-volume-slider" min="0" max="100" value="${currentVolume}">
            <span class="settings-volume-value">${currentVolume}%</span>
          </div>
        </div>
        <div class="settings-section">
          <div class="settings-section-title">Key Bindings</div>
          <p class="settings-instructions">Customize key bindings. Leave override empty to use defaults. Press Backspace to reset.</p>
          ${rowsHtml}
        </div>
        <div class="settings-buttons">
          <button class="settings-reset">Reset to Defaults</button>
          <div class="settings-actions">
            <button class="settings-cancel">Cancel</button>
            <button class="settings-save">Save</button>
          </div>
        </div>
      </div>
      </div>
    `;

    this.settingsDialog = createModal(content, { title: 'Settings' });

    const dialog = this.settingsDialog;
    const self = this;

    const inputs = dialog.findAll('.settings-override');
    for (const input of inputs) {
      input.addEventListener('keydown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        if (e.code === 'Backspace') {
          const action = e.target.getAttribute('data-action');
          e.target.value = DEFAULT_KEY_MAPPINGS[action] || '';
          return;
        }
        
        let key = e.code;
        if (key.startsWith('Key')) {
          key = key.substring(3);
        } else if (key === 'Space') {
          key = 'Space';
        } else if (key.startsWith('Digit')) {
          key = key.substring(5);
        }
        e.target.value = key;
      });
      input.addEventListener('keyup', (e) => {
        e.preventDefault();
      });
    }

    dialog.find('.settings-cancel').addEventListener('click', () => {
      dialog.close();
      self.settingsDialog = null;
    });

    dialog.find('.settings-reset').addEventListener('click', () => {
      self.settingsManager.reset();
      for (const action of actions) {
        const input = dialog.find(`input[data-action="${action}"]`);
        input.value = DEFAULT_KEY_MAPPINGS[action];
      }
      const volumeSlider = dialog.find('.settings-volume-slider');
      volumeSlider.value = Math.round((self.settingsManager.getVolume() || 0.5) * 100);
      dialog.find('.settings-volume-value').textContent = volumeSlider.value + '%';
    });

    const volumeSlider = dialog.find('.settings-volume-slider');
    const volumeValue = dialog.find('.settings-volume-value');
    volumeSlider.addEventListener('input', (e) => {
      const value = parseInt(e.target.value) / 100;
      self.settingsManager.setVolume(value);
      volumeValue.innerHTML = Math.round(value * 100) + '%';
      if (self.soundkit) {
        self.soundkit.setVolume(value);
      }
    });

    dialog.find('.settings-save').addEventListener('click', () => {
      const newMappings = {};
      const usedKeys = new Map();

      for (const action of actions) {
        const input = dialog.find(`input[data-action="${action}"]`);
        let key = input.value.trim();
        if (!key) {
          key = DEFAULT_KEY_MAPPINGS[action];
        }
        newMappings[action] = key;
      }

      for (const action of actions) {
        const key = newMappings[action];
        const normalizedKey = key.toLowerCase();
        
        if (usedKeys.has(normalizedKey)) {
          const prevAction = usedKeys.get(normalizedKey);
          newMappings[prevAction] = DEFAULT_KEY_MAPPINGS[prevAction];
          const prevInput = dialog.find(`input[data-action="${prevAction}"]`);
          prevInput.value = DEFAULT_KEY_MAPPINGS[prevAction];
        } else {
          usedKeys.set(normalizedKey, action);
        }
      }

      for (const [action, key] of Object.entries(newMappings)) {
        self.settingsManager.setKeyMapping(action, key);
      }
      self.settingsManager.save();
      dialog.close();
      self.settingsDialog = null;
    });
  }
}
BoloClientWorld.initClass();

helpers.extend(BoloClientWorld.prototype, require('./mixin'));
allObjects.registerWithWorld(BoloClientWorld.prototype);


//# Exports
module.exports = BoloClientWorld;

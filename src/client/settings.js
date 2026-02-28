const DEFAULT_KEY_MAPPINGS = {
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  fire: 'Space',
  dropMine: 'KeyS',
  build: 'KeyB',
  chat: 'Enter',
};

const KEY_DISPLAY_NAMES = {
  up: 'Move Up',
  down: 'Move Down',
  left: 'Move Left',
  right: 'Move Right',
  fire: 'Fire',
  dropMine: 'Drop Mine',
  build: 'Build Wall',
  chat: 'Chat',
};

const KEY_NAME_TO_CODE = {
  'ArrowUp': 38,
  'ArrowDown': 40,
  'ArrowLeft': 37,
  'ArrowRight': 39,
  'Space': 32,
  'Enter': 13,
  'Tab': 9,
  'Escape': 27,
  'KeyA': 65,
  'KeyB': 66,
  'KeyC': 67,
  'KeyD': 68,
  'KeyE': 69,
  'KeyF': 70,
  'KeyG': 71,
  'KeyH': 72,
  'KeyI': 73,
  'KeyJ': 74,
  'KeyK': 75,
  'KeyL': 76,
  'KeyM': 77,
  'KeyN': 78,
  'KeyO': 79,
  'KeyP': 80,
  'KeyQ': 81,
  'KeyR': 82,
  'KeyS': 83,
  'KeyT': 84,
  'KeyU': 85,
  'KeyV': 86,
  'KeyW': 87,
  'KeyX': 88,
  'KeyY': 89,
  'KeyZ': 90,
  'Digit0': 48,
  'Digit1': 49,
  'Digit2': 50,
  'Digit3': 51,
  'Digit4': 52,
  'Digit5': 53,
  'Digit6': 54,
  'Digit7': 55,
  'Digit8': 56,
  'Digit9': 57,
};

function getKeyCode(keyName) {
  return KEY_NAME_TO_CODE[keyName] || keyName.charCodeAt(0);
}

class SettingsManager {
  constructor() {
    this.keyMappings = { ...DEFAULT_KEY_MAPPINGS };
    this.volume = 0.5;
    this.load();
  }

  load() {
    try {
      const saved = localStorage.getItem('bolo-settings');
      if (saved) {
        const data = JSON.parse(saved);
        this.keyMappings = { ...DEFAULT_KEY_MAPPINGS, ...(data.keyMappings || {}) };
        this.volume = data.volume ?? 0.5;
      }
    } catch (e) {
      console.warn('Failed to load settings:', e);
    }
  }

  save() {
    try {
      localStorage.setItem('bolo-settings', JSON.stringify({
        keyMappings: this.keyMappings,
        volume: this.volume
      }));
    } catch (e) {
      console.warn('Failed to save settings:', e);
    }
  }

  setKeyMapping(action, key) {
    this.keyMappings[action] = key;
  }

  getKeyMapping(action) {
    return this.keyMappings[action] || DEFAULT_KEY_MAPPINGS[action];
  }

  getKeyCode(action) {
    return getKeyCode(this.getKeyMapping(action));
  }

  getReverseMapping(key) {
    for (const [action, mappedKey] of Object.entries(this.keyMappings)) {
      if (mappedKey === key) return action;
    }
    return null;
  }

  getReverseKeyCode(keyCode) {
    for (const [action, mappedKey] of Object.entries(this.keyMappings)) {
      if (getKeyCode(mappedKey) === keyCode) return action;
    }
    return null;
  }

  setVolume(value) {
    this.volume = value;
    this.save();
  }

  getVolume() {
    return this.volume;
  }

  reset() {
    this.keyMappings = { ...DEFAULT_KEY_MAPPINGS };
    this.save();
  }
}

module.exports = { SettingsManager, DEFAULT_KEY_MAPPINGS, KEY_DISPLAY_NAMES, getKeyCode };

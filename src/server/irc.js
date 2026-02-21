/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
const fs  = require('fs');
const ircLib = require('irc');


// This mimics basic Jerk functionality, but only accepts commands in channels,
// and only when the bot is addressed by its nickname. It also automatically reconnects.
class BoloIrc {
  constructor(options) {
    this.didAddressMe = new RegExp(`^${options.nick}[:, ]+(.+?)\\s*$`, 'i');
    this.watchers = [];

    const server = options.server || 'localhost';
    const nick = options.nick || 'OronaBot';
    const clientOptions = {
      userName: options.user && options.user.username,
      realName: options.user && options.user.realname,
      channels: [],
      autoRejoin: true,
      autoConnect: false
    };

    this.client = new ircLib.Client(server, nick, clientOptions);

    // Join channels once registered
    this.client.addListener('registered', () => {
      if (Array.isArray(options.channels) && options.channels.length) {
        for (const ch of options.channels) { this.client.join(ch); }
      }
    });

    // Handle channel messages
    this.client.addListener('message', (from, to, text, message) => {
      // only handle channel messages
      if (typeof to !== 'string' || to.charAt(0) !== '#') { return; }
      let match = this.didAddressMe.exec(text);
      if (!match) { return; }
      const m = {};
      m.channel = to;
      m.params = [to, text];
      m.text = match[1];
      m.person = {
        nick: from,
        user: message && message.user ? message.user : '',
        host: message && message.host ? message.host : ''
      };
      m.person.ident = `${m.person.user}@${m.person.host}`;
      m.say = (reply) => this.client.say(m.channel, `${m.person.nick}: ${reply}`);

      for (const watcher of Array.from(this.watchers)) {
        if (m.match_data = m.text.match(watcher.re)) {
          if (watcher.onlyAdmin && (m.person.ident !== options.admin)) {
            m.say("I can't let you do that.");
          } else {
            watcher.callback(m);
          }
          break;
        }
      }
    });

    // Try to reconnect on error if not shutting down
    this.client.addListener('error', (err) => {
      if (this.shuttingDown) { return; }
      if (this.reconnectTimer) { return; }
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        try { this.client.connect(); } catch (e) {}
      }, 10000);
    });

    try {
      this.client.connect();
    } catch (e) {
      // ignore connect errors; error event will handle reconnecting
    }
  }

  shutdown() {
    this.shuttingDown = true;
    try {
      this.client.disconnect('Augh, they got me!', () => {});
    } catch (e) {}
    return undefined;
  }

  watch_for(re, callback) {
    return this.watchers.push({re, callback});
  }

  watch_for_admin(re, callback) {
    return this.watchers.push({re, callback, onlyAdmin: true});
  }
}


// The gist of the IRC functionality we provide.
const createBoloIrcClient = function(app, options) {
  const irc = new BoloIrc(options);

  const findHisGame = function(ident) {
    for (var gid in app.games) {
      var game = app.games[gid];
      if (game.owner === ident) { return game; }
    }
  };

  irc.watch_for(/^map\s+(.+?)$/, function(m) {
    let descr;
    if (findHisGame(m.person.ident)) { return m.say("You already have a game open."); }
    if (!app.haveOpenSlots()) { return m.say("All game slots are full at the moment."); }

    const matches = app.maps.fuzzy(m.match_data[1]);
    if (matches.length === 1) {
      [descr] = Array.from(matches);
      return fs.readFile(descr.path, function(err, data) {
        if (err) { return m.say("Having some trouble loading that map, sorry."); }
        const game = app.createGame(data);
        game.owner = m.person.ident;
        return m.say(`Started game “${descr.name}” at: ${game.url}`);
      });
    } else if (matches.length === 0) {
      return m.say("I can't find any map like that.");
    } else if (matches.length > 4) {
      return m.say("You need to be a bit more specific than that.");
    } else {
      const names = (() => {
        const result = [];
        for (descr of Array.from(matches)) {           result.push(`“${descr.name}”`);
        }
        return result;
      })();
      return m.say(`Did you mean one of these: ${names.join(', ')}`);
    }
  });

  irc.watch_for(/^close$/, function(m) {
    let game;
    if (!(game = findHisGame(m.person.ident))) { return m.say("You don't have a game open."); }
    app.closeGame(game);
    return m.say("Your game was closed.");
  });

  irc.watch_for_admin(/^reindex$/, m => app.maps.reindex(() => m.say("Index rebuilt.")));

  irc.watch_for_admin(/^reset demo$/, m => app.resetDemo(err => m.say(err != null ? err : 'Demo game reset.')));

  irc.watch_for_admin(/^shutdown$/, m => app.shutdown());

  return irc;
};


//# Exports
module.exports = createBoloIrcClient;

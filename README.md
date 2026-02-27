# Bolo

Bolo is a top-down game of tank warfare originally written by Stuart Cheshire for the BBC Micro and
Apple Macintosh, and also notably rewritten for Windows and Linux by John Morrison.

 * [The Bolo homepage][Bolo]
 * [The WinBolo homepage][WinBolo]
 * [The WinBolo project at Google Code][WinBolo project]

## davidangel/bolo

This project is an attempted revitalization of the now-abandoned ["Orona" project](https://github.com/stephank/orona), which rewrote Bolo for play in modern browsers.

## Playing Bolo

This is a browser-based implementation of Bolo. To play:

1. Build the client bundle:
   ```bash
   npm run build
   ```

2. Start a local server (see "Running a Bolo server" below).

3. Open your browser and navigate to `http://localhost:8124/`.

### Controls

 * **Arrow Keys** - Move tank
 * **Space** - Fire
 * **R** - Chat
 * **Mouse** - Send little green man on missions, select items to harvest/build/deploy

## Running a Bolo server

### Prerequisites

 * [Node.js] 14 or higher
 * [git]

### Quick start (Node.js)

1. Clone the repository:
   ```bash
   git clone http://github.com/davidangel/bolo.git
   cd bolo
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy and edit the configuration:
   ```bash
   cp config.json.sample config.json
   # Edit config.json with your settings
   ```

4. Build the client:
   ```bash
   npm run build
   ```

5. Start the server:
   ```bash
   npm run server
   ```

The server will start on port 8124 by default. Open `http://localhost:8124/` in your browser to play.

### Docker

Alternatively, run the server using Docker:

```bash
docker-compose up -d
```

Configure the server using environment variables:
 * `PORT` - Server port (default: 8124)
 * `BASE_URL` - Public URL of the server
 * `MAXGAMES` - Maximum number of games (default: 5)

## License

The source code of Bolo/Orona is distributed with the GNU GPL version 2, as inherited from WinBolo.
Much of the game logic was written with WinBolo as a reference, thus becoming a derived work of it.
Though the GNU GPL version 2 is a fine license either way. You can find a copy of the license
in the COPYING file.

Some files, or parts of files, are subject to other licenses, where indicated in the files
themselves. A short overview of those parts follows.

All the graphic and sound files are from:

 * [Bolo], © 1993 Stuart Cheshire.

For the browser client, Bolo/Orona also bundles:

 * [jQuery], © 2010 John Resig, licensed MIT and GPLv2.
 * [Sizzle], © 2010 The Dojo Foundation, licensed MIT, BSD and GPL.
 * [jQuery UI], © 2010 The jQuery UI Team, licensed MIT and GPLv2.
 * [jQuery Cookie plugin], © 2006 Klaus Hartl, licensed MIT and GPLv2.
 * Components that are part of [Villain].

 [Bolo]: http://www.bolo.net/
 [WinBolo]: http://www.winbolo.com/
 [WinBolo project]: http://code.google.com/p/winbolo/

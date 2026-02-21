# Changelog

All notable changes made while modernizing the project.

## Unreleased

- Modernized dependencies in `package.json` where possible.
- Removed runtime CoffeeScript dependency by decaffeinating `src/` and `node_modules/villain`.
- Converted CoffeeScript server and client sources to JavaScript and fixed decaffeinate artifacts (added necessary `super(...arguments)` calls, corrected constructor ordering).
- Replaced legacy `irc-js` usage with the maintained `irc` package and adapted `src/server/irc.js`.
- Updated `bin/bolo-server` to load JS entrypoints (removed CoffeeScript register shims).
- Rebuilt browser bundle `js/bolo-bundle.js` and exposed the client as global `World` for direct script usage.
- Updated `index.html` to fall back to `window.World` when `require` is not available.
- Patched `node_modules/fresh/index.js` defensively to avoid a runtime crash when `res` is undefined (temporary fix for server static-serving bug).
- Replaced deprecated `connect.createServer()` usage with `connect()` in `src/server/application.js`.
- Added small scripts used during migration: `scripts/find_bad_constructors.js`.
- Performed smoke tests: server starts, demo games created; browser client bundle built.

## Notes

- Some third-party and transitive dependencies remain vulnerable (see `npm audit`).  Further dependency migration and an Express migration are recommended.
- The `fresh` patch is a defensive, local fix — consider updating the dependency or upstreaming the patch.

---

Generated/edited files include (high-level):
- `package.json` updates
- many `src/*.js` files (decaffeinated + fixes)
- `js/bolo-bundle.js` (rebuilt)
- `index.html` (safe require fallback)
- `bin/bolo-server` (JS entry)
- `CHANGELOG.md` (this file)

If you want, I can create a proper Git commit message and push to a remote next.

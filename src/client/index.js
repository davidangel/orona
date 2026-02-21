const BoloLocalWorld   = require('./world/local');
const BoloNetworkWorld = require('./world/client');


//# Exports

if ((location.search === '?local') || (location.hostname.split('.')[1] === 'github')) {
  module.exports = BoloLocalWorld;
} else {
  module.exports = BoloNetworkWorld;
}

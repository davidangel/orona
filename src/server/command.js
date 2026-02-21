const puts = console.log;
const fs     = require('fs');
const path   = require('path');
const createBoloApp = require('./application');
const createBoloIrcClient = require('./irc');

exports.run = function() {
  // FIXME: I want YAML, damnit!
  let config, content, e;
  if (process.argv.length !== 3) {
    puts("Usage: bolo-server <config.json>");
    puts("If the file does not exist, a sample will be created.");
    return;
  }

  try {
    content = fs.readFileSync(process.argv[2], 'utf-8');
  } catch (error) {
    e = error;
    if (e.code !== 'ENOENT') {
      puts("I was unable to read that file.");
      throw e;
    }

    const samplefile = path.join(path.dirname(fs.realpathSync(__filename)), '../../config.json.sample');
    const sample = fs.readFileSync(samplefile, 'utf-8');
    try {
      fs.writeFileSync(process.argv[2], sample, 'utf-8');
    } catch (e2) {
      puts("Oh snap! I want to create a sample configuration, but can't.");
      throw e2;
    }
    puts("I created a sample configuration for you.");
    puts("Please edit the file, then run the same command again.");
    return;
  }

  try {
    config = JSON.parse(content);
  } catch (error1) {
    e = error1;
    puts("I don't understand the contents of that file.");
    throw e;
  }

  const app = createBoloApp(config);
  app.listen(config.web.port);
  puts(`Bolo server listening on port ${config.web.port}.`);

  if (config.irc) {
    for (var link in config.irc) {
      var options = config.irc[link];
      app.registerIrcClient(createBoloIrcClient(app, options));
    }
  }

};

'use strict';

var RegClient = require('npm-registry-client');
module.exports = new RegClient({
  cache: __dirname + '/../cache/npm',
  log: {
    error: noop,
    warn: noop,
    info: noop,
    verbose: noop,
    silly: noop,
    http: noop,
    pause: noop,
    resume: noop
  }
});
module.exports.base = "http://registry.npmjs.org/";
function noop() {}

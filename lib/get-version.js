'use strict';

var Promise = require('promise');
var cache = require('./cache');

module.exports = getVersion;
function getVersion(name, version) {
  return cache.registry(name + '/' + version);
}

'use strict';

var Promise = require('promise');
var cache = require('./cache');

module.exports = getVersions;
function getVersions(name, version) {
  return cache.registry(name).then(function (data) {
    return Object.keys(data.versions);
  });
}

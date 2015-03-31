'use strict';

var Promise = require('promise');
var cache = require('./cache');

// TODO: this should fetch a specific version of the readme
module.exports = getReadme;
function getReadme(name, version) {
  return cache.registry(name).then(function (data) {
    return data.readme || '';
  });
}

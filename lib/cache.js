'use strict';

var level = require('level');
var Promise = require('promise');
var Promise = require('promise');
var Map = require('es6-map');
var bundle = require('./bundle');
var registry = require('./registry');
var db = level(__dirname + '/../cache');

function get(path) {
  return new Promise(function (resolve, reject) {
    db.get(path, function (err, res) {
      if (err) reject(err);
      else resolve(res);
    });
  });
}
function put(path, value) {
  return new Promise(function (resolve, reject) {
    db.put(path, value, function (err, res) {
      if (err) reject(err);
      else resolve(res);
    });
  });
}

exports.bundle = function (url) {
  return get(url).then(null, function (err) {
    if (!err.notFound) throw err;
    return bundle(url).then(function (result) {
      return put(url, result).then(function () { return result; });
    });
  });
};

var inFlight = new Map();
exports.registry = function (url) {
  return get(url).then(function (result) {
    updateRegistryUrl(url, false);
    return JSON.parse(result);
  }, function (err) {
    if (!err.notFound) throw err;
    return updateRegistryUrl(url, true);
  });
};

function updateRegistryUrl(url, isNew) {
  var result = inFlight.get(url);
  if (result) return result;
  result = getRegistry(url).then(function (result) {
    return put(url, JSON.stringify(result)).then(function () { return result; });
  });
  inFlight.set(url, isNew ? result : true);
  setTimeout(function () {
    inFlight.delete(url);
  }, 30000);
  return result;
}

function getRegistry(url) {
  return new Promise(function (resolve, reject) {
    registry.request(registry.base + url, {}, function (err, data) {
      if (err) return reject(err);
      resolve(data);
    });
  });
}

'use strict';

var level = require('level');
var Promise = require('promise');
var Promise = require('promise');
var Map = require('es6-map');
var bundle = require('./bundle');
var registry = require('./registry');
var db = level(process.env.CACHE_DIR || __dirname + '/../cache');

var inFlight = new Map();
function get(path) {
  var value = inFlight.get(path);
  if (value) {
    return Promise.resolve(value);
  }
  return new Promise(function (resolve, reject) {
    db.get(path, function (err, res) {
      if (err) reject(err);
      else resolve(res);
    });
  });
}
function put(path, value) {
  inFlight.set(path, value);
  return Promise.resolve(value).then(function (value) {
    return new Promise(function (resolve, reject) {
      db.put(path, value, function (err, res) {
        if (err) {
          reject(err);
        } else {
          resolve(res);
        }
      });
    });
  }).then(function () {
    inFlight.delete(path);
    return value;
  }, function (err) {
    inFlight.delete(path);
    throw err;
  });
}

exports.bundle = function (url) {
  return get(url).then(null, function (err) {
    if (!err.notFound) throw err;
    return put(url, bundle(url));
  });
};

var registryRequests = new Map();
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
  var result = registryRequests.get(url);
  if (result) return result;
  result = getRegistry(url).then(function (result) {
    return put(url, JSON.stringify(result)).then(function () { return result; });
  });
  registryRequests.set(url, isNew ? result : true);
  setTimeout(function () {
    registryRequests.delete(url);
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

'use strict';

var assert = require('assert');
var level = require('level');
var Map = require('es6-map');
var throat = require('throat');
var Promise = require('promise');
var bytewise = require('bytewise');
var db = level(process.env.STATS_DIR || __dirname + '/../stats', {
  keyEncoding: bytewise,
  valueEncoding: 'json'
});

var inFlight = new Map();
function lockName(fn) {
  return function (name, req) {
    var flight = Promise.resolve(inFlight.get(name));
    flight = flight.then(function () {
      return fn(name, req);
    }).then(function (result) {
      if (inFlight.get(name) === flight) {
        inFlight.delete(name);
      }
      return result;
    });
    inFlight.set(name, flight);
    return flight;
  }
}
exports.increment = lockName(function (name, req) {
  if (req.headers['no-stats']) return Promise.resolve(null);
  return (new Promise(function (resolve, reject) {
    db.get(['stats', name], function (err, value) {
      if (err) reject(err);
      else resolve(value);
    });
  })).then(function (value) {
    return new Promise(function (resolve, reject) {
      db.batch([
        {type: 'del', key: ['index', value, name]},
        {type: 'put', key: ['index', value - 1, name], value: true},
        {type: 'put', key: ['stats', name], value: value + 1}
      ], function (err, res) {
        if (err) reject (err);
        else resolve(res);
      });
    });
  }, function (err) {
    if (!err.notFound) throw err;
    return new Promise(function (resolve, reject) {
      db.batch([
        {type: 'put', key: ['index', -1, name], value: true},
        {type: 'put', key: ['stats', name], value: 1}
      ], function (err, res) {
        if (err) reject (err);
        else resolve(res);
      });
    });
  });
});

exports.topTen = function () {
  return new Promise(function (resolve, reject) {
    var results = [];
    db.createReadStream({
      // TODO: these should be gt and lt but
      // that doesn't seem to work with `require('level')`
      start: ['index', null, null],
      end: ['index', undefined, undefined],
      limit: 10,
      values: false
    }).on('data', function (key) {
      assert(key[0] === 'index');
      results.push({name: key[2], value: key[1] * -1});
    }).on('end', function () {
      resolve(results);
    }).on('error', reject);
  });
};

'use strict';

var Promise = require('promise');
var throat = require('throat')(Promise);
var concat = require('concat-stream');
var dockerStream = require('docker-stream');
var Map = require('es6-map');
var pkg = require('../package.json');

var pending = new Map();

module.exports = build;
function build(name, version, options) {
  var key = name + '@' + version;
  var queued = pending.get(key);
  if (!queued) {
    queued = {
      queue: [],
      result: new Promise(function (resolve) {
        setTimeout(function () {
          resolve(buildBundles(name + '@' +version));
        }, 200);
      })
    };
    pending.set(name + '@' + version, queued);
  }
  var index = queued.queue.length;
  queued.queue[index] = options;
  return queued.result.then(function (results) {
    return new Buffer(results[index]);
  }).then(null, function (err) {
    err.message += ' (while building ' + key + ')';
    throw err;
  });
}

var buildBundles = throat(1, function (key) {
  console.dir(key);
  return (new Promise(function (resolve, reject) {
    var name = key.split('@')[0];
    var version = key.split('@')[1];
    var bundles = pending.get(key).queue;
    var stream = dockerStream('browserifyer-' + pkg.version);
    stream.on('error', function (err) {
      return reject(err);
    });
    var stderr = new Promise(function (resolve) {
      stream.stderr.pipe(concat(resolve));
    });
    var stdout = new Promise(function (resolve) {
      stream.pipe(concat(resolve));
    });
    stream.on('exit', function (code) {
      if (code) {
        return stderr.done(function (stderr) {
          reject(new Error('Build Error: ' + stderr));
        }, reject);
      } else {
        return stdout.done(function (stdout) {
          stdout = stdout.toString('utf8');
          return resolve(JSON.parse(stdout));
        });
      }
    });
    stream.end(JSON.stringify({
      module: name,
      version: version,
      bundles: bundles
    }));
  }));
});

'use strict';

var fork = require('child_process').fork;
var Promise = require('promise');
var throat = require('throat')(Promise);
var concat = require('concat-stream');
var dockerStream = require('docker-stream');
var Map = require('es6-map');
var equal = require('deep-equal');
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
  var buildOptions = JSON.parse(JSON.stringify(options));
  if (buildOptions.uglify) delete buildOptions.uglify;
  var index = -1;
  for (var i = 0; i < queued.queue.length; i++) {
    if (equal(queued.queue[i], buildOptions)) {
      index = i;
      break;
    }
  }
  if (index === -1) {
    index = queued.queue.length;
    queued.queue[index] = buildOptions;
  }
  return queued.result.then(function (results) {
    var str = results[index];
    if (options.uglify) {
      if (typeof options.uglify !== 'object') {
        options.uglify = {};
      }
      options.uglify.fromString = true;
      return uglifyAsync(str, options.uglify);
    } else {
      return str;
    }
  }).then(function (str) {
    return new Buffer(str);
  }).then(null, function (err) {
    if (err.message.indexOf('while building') === -1) {
      err.message += ' (while building ' + key + ')';
    }
    throw err;
  });
}

var buildBundles = throat(1, function (key) {
  console.dir(key);
  return (new Promise(function (resolve, reject) {
    setTimeout(function () {
      reject(new Error('Build timed out'));
    }, 60 * 1000);
    var name = key.split('@')[0];
    var version = key.split('@')[1];
    var bundles = pending.get(key).queue;
    pending.delete(key);
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
    stream.on('exit', function (status) {
      Promise.all([stdout, stderr]).done(function (results) {
        resolve({
          status: status,
          stdout: results[0],
          stderr: results[1]
        });
      }, reject);
    });
    stream.end(JSON.stringify({
      module: name,
      version: version,
      bundles: bundles
    }));
  })).then(function (res) {
    var stdout = res.stdout.toString('utf8').split('\n');
    var validLines = stdout.map(function (line) {
      try {
        var value = JSON.parse(line);
        if (Array.isArray(value) && value.every(function (val) {
          return typeof val === 'string';
        })) {
          return value;
        }
      } catch (ex) {
        console.log(line);
      }
    }).filter(Boolean);

    // sometimes docker incorrectly exits with code
    // 137 even though the actual process exited correct
    // see https://github.com/docker/docker/issues/1063
    if (validLines.length !== 1) {
      throw new Error('Build Error ' +
                      res.status + ': ' +
                      res.stderr.toString() +
                      res.stdout.toString());
    } else {
      return validLines[0];
    }
  });
});


var uglifyWorkers = [];
for (var i = 0; i < 10; i++) {
  (function (worker) {
    uglifyWorkers.push(worker);
    worker.on('exit', function () {
      if (worker.isDead) return;
      worker.isDead = true;
      if (worker.onExitReject) worker.onExitReject(new Error('Worker exited unexpectedly'));
      uglifyWorkers.push(fork(require.resolve('./uglify-worker.js')));
    });
  }(fork(require.resolve('./uglify-worker.js'))));
}

var uglifyAsync = throat(10, function (bundle, options) {
  return new Promise(function (resolve, reject) {
    var worker = null;
    while (!worker || worker.isDead) {
      worker = uglifyWorkers.pop();
    }
    worker.onExitReject = reject;
    worker.once('message', function (data) {
      uglifyWorkers.push(worker);
      if (data.error) reject(new Error(data.error));
      else resolve(data.result);
    });
    setTimeout(function () {
      reject(new Error('Minifying timed out'));
    }, 1000 * 60);
    worker.send({
      bundle: bundle,
      options: options
    });
  });
});

'use strict';

var Promise = require('promise');
var concat = require('concat-stream');
var dockerStream = require('docker-stream');

module.exports = build;
function build(name, version, options) {
  return (new Promise(function (resolve, reject) {
    var stream = dockerStream('browserifyer');
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
        return resolve(stdout);
      }
    });
    stream.end(JSON.stringify({
      module: name,
      version: version,
      options: options
    }));
  }));
}

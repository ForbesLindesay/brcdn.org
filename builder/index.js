'use strict';

var fs = require('fs');
var path = require('path');
var spawn = require('child_process').spawnSync;
var concat = require('concat-stream');
var browserify = require('browserify');

function respond(data) {
  process.stdout.write(JSON.stringify(data), function() {
    process.exit(0);
  });
}
function timer() {
  var start = Date.now();
  return function time(name) {
    console.log(name + ': ' + (Date.now() - start));
    start = Date.now();
  }
}
var time = timer();
process.stdin.pipe(concat(function (stdin) {
  var req = JSON.parse(stdin.toString());
  time('read options');
  var res = spawn('npm', ['install', req.module + '@' + req.version], {
    cwd: __dirname
  });
  if (res.status !== 0) {
    process.stderr.write(res.stderr);
    process.exit(res.status);
    return;
  }
  time('install module');
  var inputs = [];
  var bundles = [];

  Promise.all(req.bundles.map(function (options) {
    return buildBundle(req, options);
  })).then(function (bundles) {
    time('build bundles');
    respond(bundles);
  }).then(null, function (err) {
    setTimeout(function () {
      throw err;
    }, 0);
  });
}));

function buildBundle(req, options) {
  var time = timer();
  return new Promise(function (resolve, reject) {
    if (options.raw) {
      fs.readFile(path.resolve(__dirname + '/node_modules/' + req.module + '/', options.entries[0]), 'utf8', function (err, bundle) {
        time('read file');
        if (err) {
          return reject(err);
        }
        resolve(bundle);
      });
      return;
    }
    var res;
    if (options.transform) {
      if (typeof options.transform === 'string') {
        options.transform = [options.transform];
      }
      res = spawn('npm', ['install'].concat(options.transform.map(function (tr) {
        return tr.split('/')[0];
      })), {
        cwd: __dirname
      });
      if (res.status !== 0) {
        process.stderr.write(res.stderr);
        process.exit(res.status);
      }
      time('install transforms');
    }
    var entries = options.entries;
    options.entries = [];
    options.basedir = __dirname + '/node_modules/' + req.module + '/';
    var bundle = browserify(options);
    if (options.standalone) {
      entries.forEach(function (entry) {
        bundle.add(entry);
      });
    } else {
      entries.forEach(function (entry) {
        var ropts = {};
        if (options.expose) {
          ropts.expose = options.expose;
        } else {
          ropts.expose = req.module;
        }
        bundle.require(entry, ropts);
      });
    }
    time('prepare bundle');
    bundle.bundle(function (err, bundle) {
      time('compile bundle' + (options.standalone ? ' standalone' : ''));
      if (err) {
        return reject(err);
      }
      resolve(bundle.toString('utf8'));
    });
  });
}

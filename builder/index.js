'use strict';

var fs = require('fs');
var path = require('path');
var spawn = require('child_process').spawnSync;
var concat = require('concat-stream');
var browserify = require('browserify');
var uglify = require('uglify-js');

function respond(data) {
  process.stdout.write(JSON.stringify(data), function() {
    process.exit(0);
  });
}
process.stdin.pipe(concat(function (stdin) {
  var req = JSON.parse(stdin.toString());
  var res = spawn('npm', ['install', req.module + '@' + req.version], {
    cwd: __dirname
  });
  if (res.status !== 0) {
    process.stderr.write(res.stderr);
    process.exit(res.status);
    return;
  }
  Promise.all(req.bundles.map(function (options) {
    return buildBundle(req, options);
  })).then(function (bundles) {
    respond(bundles);
  }).then(null, function (err) {
    setTimeout(function () {
      throw err;
    }, 0);
  });
}));

function buildBundle(req, options) {
  return new Promise(function (resolve, reject) {
    if (options.raw) {
      fs.readFile(path.resolve(__dirname + '/node_modules/' + req.module + '/', options.entries[0]), 'utf8', function (err, bundle) {
        if (err) {
          return reject(err);
        }
        if (options.uglify) {
          if (typeof options.uglify !== 'object') {
            options.uglify = {};
          }
          options.uglify.fromString = true;
          try {
            bundle = uglify.minify(bundle, options.uglify).code;
          } catch (ex) {}
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
    bundle.bundle(function (err, bundle) {
      if (err) {
        return reject(err);
      }
      bundle = bundle.toString('utf8');
      if (options.uglify) {
        if (typeof options.uglify !== 'object') {
          options.uglify = {};
        }
        options.uglify.fromString = true;
        try {
          bundle = uglify.minify(bundle, options.uglify).code;
        } catch (ex) {}
      }
      resolve(bundle);
    });
  });
}

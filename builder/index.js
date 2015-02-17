'use strict';

var fs = require('fs');
var path = require('path');
var spawn = require('child_process').spawnSync;
var concat = require('concat-stream');
var browserify = require('browserify');
var uglify = require('uglify-js');

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
  var options = req.options || {};
  if (options.raw) {
    fs.readFile(path.resolve(__dirname + '/node_modules/' + req.module + '/', options.entries[0]), function (err, bundle) {
      if (err) {
        throw err;
      }
      if (options.uglify) {
        if (typeof options.uglify !== 'object') {
          options.uglify = {};
        }
        options.uglify.fromString = true;
        try {
          var code = uglify.minify(bundle.toString('utf8'), options.uglify).code;
          process.stdout.write(code);
          return;
        } catch (ex) {}
      }
      process.stdout.write(bundle);
    });
    return;
  }
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
      throw err;
    }
    if (options.uglify) {
      if (typeof options.uglify !== 'object') {
        options.uglify = {};
      }
      options.uglify.fromString = true;
      try {
        var code = uglify.minify(bundle.toString('utf8'), options.uglify).code;
        process.stdout.write(code);
        return;
      } catch (ex) {}
    }
    process.stdout.write(bundle);
  });
}));

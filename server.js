'use strict';

var createHash = require('crypto').createHash;
var Promise = require('promise');
var express = require('express');
var semver = require('semver');
var less = require('less-file');
var MarkdownIt = require('markdown-it');
var hljs = require('highlight.js');
var cache = require('./lib/cache');
var getVersions = require('./lib/get-versions');
var getVersion = require('./lib/get-version');
var getReadme = require('./lib/get-readme');
var bundle = cache.bundle;

var md = new MarkdownIt({
  linkify: true,
  typographer: true,
  highlight: function (str, lang) {
    if (lang === 'js') lang = 'javascript';
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(lang, str).value;
      } catch (__) {}
    }

    try {
      return hljs.highlightAuto(str).value;
    } catch (__) {}

    return ''; // use external default escaping
  }
});

var app = express();
app.set('views', __dirname + '/views');


var staticFiles = app.locals.staticFiles = '/static/' + require('./package.json').version;
app.use(staticFiles + '/style', less('./style/style.less'));

app.get('/', function (req, res, next) {
  if (req.query.module) return next();
  res.render('home.jade');
});
app.get('/', function (req, res, next) {
  var name = req.query.module;
  var specifier = req.query.version;
  if (specifier !== 'list') return next();
  getVersions(name).done(function (versions) {
    res.render('module-versions.jade', {
      name: name,
      versions: versions
    });
  });
});
app.get('/', function (req, res, next) {
  var name = req.query.module;
  var specifier = req.query.version || 'latest';
  if (semver.valid(specifier)) {
    return next();
  } else {
    if (specifier === 'latest') specifier = '*';
    return getVersions(name).done(function (versions) {
      var version = semver.maxSatisfying(versions, specifier);
      if (version) {
        res.redirect('/?module=' + name + '&version=' + version);
      } else {
        return next();
      }
    }, next);
  }
});
app.get('/', function (req, res, next) {
  var name = req.query.module;
  var version = req.query.version;
  if (!semver.valid(version)) {
    return next();
  }
  return getVersions(name).then(function (versions) {
    if (versions.indexOf(version) === -1) return next();
    return Promise.all([
      getVersion(name, version),
      getReadme(name, version)
    ]).then(function (results) {
      var specs = results[0].brcdn || [
        {
          name: 'unminified',
          description: 'Use this version in development',
          browserify: '',
          standalone: '?standalone=' + name
        },
        {
          name: 'minified',
          description: 'Use this version in production',
          browserify: '?uglify=true',
          standalone: '?uglify=true&standalone=' + name
        }
      ];
      function resolveUrls(spec) {
        return Promise.all(['browserify', 'standalone', 'other'].map(function (key) {
          if (typeof spec[key] !== 'string') return;
          var path = spec[key].replace(/^\.?\//, '');
          return bundle('/' + name + '/' + version + '/' + path).then(function (url) {
            spec[key] = '//brcdn.org' + url;
          });
        })).then(function () {
          return spec;
        });
      }
      return Promise.all(specs.map(resolveUrls)).then(function (specs) {
        res.render('module.jade', {
          pkg: results[0],
          specs: specs,
          readme: md.render(results[1].replace(/^\s*\#[^#]+\n/g, ''))
        });
      });
    });
  }).done(null, next);
});
app.get('/:module/:version*', function (req, res, next) {
  var name = req.params.module;
  var specifier = req.params.version;
  var path = req.url.substr(2 + encodeURIComponent(name).length + encodeURIComponent(specifier).length);
  if (path[0] === '/') path = path.substr(1);
  if (semver.valid(specifier)) {
    return next();
  } else {
    if (specifier === 'latest') specifier = '*';
    return getVersions(name).done(function (versions) {
      var version = semver.maxSatisfying(versions, specifier);
      if (version) {
        res.redirect('/' + req.params.module + '/' + version + '/' + path);
      } else {
        return next();
      }
    }, next);
  }
});
app.get('/:module/:version*', function (req, res, next) {
  var name = req.params.module;
  var version = req.params.version;
  if (!semver.valid(version)) {
    return next();
  }
  return getVersions(name).then(function (versions) {
    if (versions.indexOf(version) === -1) return next();
    return bundle(req.url).then(function (path) {
      res.redirect('//brcdn.org' + path);
    });
  }).done(null, next);
});

app.listen(process.env.PORT || 3000);

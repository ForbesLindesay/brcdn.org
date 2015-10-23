'use strict';

var createHash = require('crypto').createHash;
var Promise = require('promise');
var express = require('express');
var semver = require('semver');
var less = require('less-file');
var MarkdownIt = require('markdown-it');
var hljs = require('highlight.js');
var sanitizeHtml = require('sanitize-html');
var jade = require('jade');
var stats = require('./lib/stats');
var cache = require('./lib/cache');
var getVersions = require('./lib/get-versions');
var getVersion = require('./lib/get-version');
var getReadme = require('./lib/get-readme');
var bundle = cache.bundle;
var bundleUnCached = require('./lib/bundle');

var md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  langPrefix: 'hljs ',
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
var sanitizerOptions = {
  transformTags: {
    'h1': 'h2',
  },
  allowedTags: [
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'blockquote',
    'p',
    'a',
    'ul',
    'ol',
    'nl',
    'li',
    'b',
    'i',
    'strong',
    'em',
    'strike',
    'code',
    'hr',
    'br',
    'div',
    'table',
    'thead',
    'caption',
    'tbody',
    'tr',
    'th',
    'td',
    'pre',
    'code',
    'span',
    'img'
  ],
  allowedAttributes: {
    a: [ 'href', 'name'],
    img: [ 'src', 'align', 'alt' ]
  },
  allowedClasses: {
    code: [
      'clojure',
      'css',
      'diff',
      'django',
      'haskell',
      'javascript',
      'lisp',
      'nginx',
      'ruby',
      'rule',
      'tex',
      'vhdl',
      'hljs'
    ],
    span: [
      'hljs-addition',
      'hljs-attribute',
      'hljs-body',
      'hljs-cdata',
      'hljs-change',
      'hljs-chunk',
      'hljs-class',
      'hljs-command',
      'hljs-comment',
      'hljs-constant',
      'hljs-deletion',
      'hljs-doctype',
      'hljs-formula',
      'hljs-header',
      'hljs-hexcolor',
      'hljs-javadoc',
      'hljs-keyword',
      'hljs-literal',
      'hljs-number',
      'hljs-phpdoc',
      'hljs-pi',
      'hljs-pragma',
      'hljs-preprocessor',
      'hljs-prompt',
      'hljs-property',
      'hljs-regexp',
      'hljs-request',
      'hljs-rules',
      'hljs-shebang',
      'hljs-special',
      'hljs-status',
      'hljs-string',
      'hljs-subst',
      'hljs-symbol',
      'hljs-tag',
      'hljs-template_comment',
      'hljs-title',
      'hljs-type',
      'hljs-value',
      'hljs-variable',
      'hljs-winutils'
    ]
  },
  // URL schemes we permit
  allowedSchemes: [ 'http', 'https', 'ftp', 'mailto' ]
};
function sanatize(str) {
  return sanitizeHtml(str, sanitizerOptions);
}

var app = express();


var staticFiles = app.locals.staticFiles = '/static/' + require('./package.json').version;
app.use(staticFiles + '/style', less('./style/style.less', {
  cache: true,
  minify: true,
  gzip: true,
  debug: false
}));

var views = {
  'home': jade.renderFile(__dirname + '/views/home.jade', {
    staticFiles: staticFiles
  }),
  'module': jade.compileFile(__dirname + '/views/module.jade'),
  'module-versions': jade.compileFile(__dirname + '/views/module-versions.jade')
};

app.get('/', function (req, res, next) {
  if (req.query.module) return next();
  res.send(views['home']);
});
app.get('/', function (req, res, next) {
  var name = req.query.module;
  var specifier = req.query.version;
  if (specifier !== 'list') return next();
  getVersions(name).done(function (versions) {
    res.send(views['module-versions']({
      staticFiles: staticFiles,
      name: name,
      versions: versions
    }));
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
    return stats.increment(name, req).then(function () {
      return Promise.all([
        getVersion(name, version),
        getReadme(name, version)
      ])
    }).then(function (results) {
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
        res.send(views['module']({
          staticFiles: staticFiles,
          pkg: results[0],
          specs: specs,
          readme: sanatize(md.render(results[1]))
        }));
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
    return stats.increment(name, req).then(function () {
      return bundle(req.url);
    }).then(function (path) {
      res.redirect('//brcdn.org' + path);
    });
  }).done(null, next);
});

app.get('/stats', function (req, res, next) {
  stats.topTen().done(function (ten) {
    res.json(ten);
  }, next);
});
var request = require('then-request');
var ms = require('ms');
app.get('/status', function (req, res, next) {
  var fail = false;
  stats.topTen().then(function (ten) {
    var base = 'http://' + req.headers.host;
    var urls = [
      '/',
      '/throat/2.0.2/index.js?uglify=true',
      '/uglify-js/2.2.5?transform=uglify-to-browserify',
      '/throat/2.0.2?uglify[output][beautify]=true',
      '/promise/6.1.0/polyfill-done.js?raw=true',
      '/?module=jade&version=latest',
      '/jade/%5E1.0.0?standalone=jade',
      '/?module=throat',
      '/?module=uglify-js',
      '/?module=promise',
      '/?module=jade',
      '/?module=then-request',
      '/?module=request',
      '/?module=lodash',
      '/?module=underscore',
      // TODO: fix browserifying less
      // '/?module=less',
      '/?module=react-canvas',
      '/?module=react',
      '/?module=kefir'
    ].concat(ten.map(function (item) {
      return '/?module=' + item.name;
    })).map(function (url) {
      return base + url;
    }).filter(function (item, index, all) {
      return all.indexOf(item) === index;
    });
    var start = Date.now();
    var uncached = bundleUnCached('/require-test/1.0.0?standalone=test&uglify=true').then(function () {
      return {success: true, duration: Date.now() - start};
    }, function (err) {
      return {success: false, duration: Date.now() - start, err: err ? (err.message || err) : 'unknown'};
    });
    return urls.reduce(function (acc, url) {
      return acc.then(function (acc) {
        var start = Date.now();
        function get(url) {
          return request('GET', url, {
            followRedirects: false,
            headers: {'no-stats': 'true'}
          }).then(function (res) {
            if ([301, 302, 303, 307, 308].indexOf(res.statusCode) !== -1) {
              return get(require('url').resolve(url, res.headers['location']));
            } else {
              return res;
            }
          });
        }
        return get(url).then(function (res) {
          var color = 'black';
          if (res.statusCode !== 200) {
            color = 'red';
            fail = true;
          }
          var duration = Date.now() - start;
          var durationColor = 'black';
          if (duration > 1000) {
            durationColor = 'orange';
          }
          if (duration > 30000) {
            durationColor = 'red';
          }
          return acc +
            '<li><strong>' + url +
            '</strong> <span style="color: ' + color +'">' +
            res.statusCode + '</span> <i style="color: ' + durationColor + '">(' + ms(duration) +
            ')</i></li>';
        });
      });
    }, uncached.then(function (res) {
      var color = 'black';
      if (!res.success) {
        color = 'red';
        fail = true;
      }
      var durationColor = 'black';
      if (res.duration > 1000) {
        durationColor = 'orange';
      }
      if (res.duration > 30000) {
        durationColor = 'red';
      }
      return (
        '<li><strong>uncached request' +
        '</strong> <span style="color: ' + color +'">' +
        (res.success ? 'success' : res.err) + '</span> <i style="color: ' + durationColor + '">(' + ms(res.duration) +
        ')</i></li>'
      );
    }));
  }).done(function (results) {
    res.writeHead(fail ? 500 : 200, {'Content-Type': 'text/html'});
    res.end('<ul>' + results + '</ul>');
  }, next);
});

app.listen(process.env.PORT || 3000);

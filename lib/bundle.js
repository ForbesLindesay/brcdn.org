'use strict';

var path = require('path');
var url = require('url');
var createHash = require('crypto').createHash;
var Promise = require('promise');
var knox = require('knox');
var mime = require('mime-types');
var qs = require('qs');
var http = require('http-basic');
var build = require('./build');

var client = knox.createClient({
  bucket: process.env.AWS_BUCKET,
  key: process.env.AWS_KEY,
  secret: process.env.AWS_SECRET
});

module.exports = bundle;
function bundle(uri) {
  var query = qs.parse(uri.split('?')[1]);
  var split = uri.split('?')[0].split('/');
  if (!split[0]) split.shift();
  var name = split.shift();
  var version = split.shift();
  var options = copy(query);
  var filename = split[split.length - 1];
  options.entries = ['./' + split.join('/')];
  return build(name, version, options).then(function (bundle) {
    return publish(name, version, filename, options, bundle);
  });
}

function publish(name, version, filename, options, bundle) {
  var id = sha1(bundle);
  var endPath = '/' + id;
  if (options.raw) {
    if (filename.split('.').length > 1) {
      endPath += '.' + filename.split('.')[filename.split('.').length - 1];
    }
  } else {
    endPath += '.js';
  }
  // make sure we don't populate the cloudflare cache with a 404 by going to a different url
  return verify(endPath, id).then(null, function (err) {
    return new Promise(function (resolve, reject) {
      var headers = {
        'Content-Type': mime.contentType(endPath.replace(/\/|\\/g, '')) || 'application/octet-stream',
        'x-amz-acl': 'public-read'
      };
      client.putBuffer(bundle, endPath, headers, function (err, res) {
        if (err) reject(err);
        else resolve(endPath);
      });
    }).then(function () {
      return verify(endPath, id);
    });
  });
}
function verify(endPath, id) {
  return getSha1('http://brcdn.org.s3-website-us-east-1.amazonaws.com' + endPath).then(function (publishedId) {
    if (publishedId !== id) throw new Error('sha check failed');
    return endPath;
  });
}
function sha1(bundle) {
  return createHash('sha1').update(bundle).digest('base64').replace(/[^A-Z0-9a-z]/g, '');
}
function copy(query) {
  if (Array.isArray(query)) {
    return query.map(copy);
  } else if (query && typeof query === 'object') {
    var options = {};
    Object.keys(query).forEach(function (key) {
      options[key] = copy(query[key]);
    });
    return options;
  } else if (query === 'true') {
    return true;
  } else if (query === 'false') {
    return false;
  } else {
    return query;
  }
}
function getSha1(url) {
  return new Promise(function (resolve, reject) {
    http('GET', url, function (err, res) {
      if (err) return reject(err);
      if (res.statusCode !== 200) {
        res.body.resume();
        return reject(new Error('expected status code to be 200 but got ' + res.statusCode));
      }
      var hash = createHash('sha1');
      res.body.on('error', reject);
      res.body.on('data', function (data) {
        hash.update(data);
      });
      res.body.on('end', function () {
        resolve(hash.digest('base64').replace(/[^A-Z0-9a-z]/g, ''));
      });
    });
  });
}

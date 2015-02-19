'use strict';

var uglify = require('uglify-js');

process.on('message', function(data) {
  var result;
  try {
    result = uglify.minify(data.bundle, data.options).code;
  } catch (ex) {
    process.send({
      error: ex.message || ex
    });
    return;
  }
  process.send({
    result: result
  });
}, false);

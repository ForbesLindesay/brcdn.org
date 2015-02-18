var fs = require('fs');
var cls = fs.readFileSync(__dirname + '/classes', 'utf8');
cls = cls.split('\n').filter(Boolean).sort().filter(function (c, i, cls) {
  return cls.indexOf(c) == i;
});
console.dir(cls);

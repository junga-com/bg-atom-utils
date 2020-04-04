// eslint-disable-next-line no-global-assign
if (typeof __global__ == 'undefined') require = require("esm")(module/* , options */)
module.exports = require(require('./package.json').module)

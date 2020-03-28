// Set options as a parameter, environment variable, or rc file.
if (!__global__)
	// eslint-disable-next-line no-global-assign
	require = require("esm")(module/* , options */)
module.exports = require("./bg-atom-utils.js")

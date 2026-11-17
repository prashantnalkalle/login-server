// Explicit Vercel route for the nested login endpoint. Some project routing
// configurations do not map this path through the root API catch-all.
module.exports = require('../[...path].js');

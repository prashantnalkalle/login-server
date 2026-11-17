// Vercel routes /api/* requests through this serverless function.
// Keep the Express app exported as a handler; do not call app.listen() here.
const app = require('../src/app');
const { connectStorage } = require('../src/storage');

let storageReady;

module.exports = async function handler(req, res) {
  // Apply CORS before database initialization so every method, including failed
  // requests, has browser-readable headers. This mirrors src/app.js.
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  }

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
    const requestedHeaders = req.headers['access-control-request-headers'];
    if (requestedHeaders) {
      res.setHeader('Access-Control-Allow-Headers', requestedHeaders);
      res.setHeader('Vary', 'Origin, Access-Control-Request-Headers');
    }
    return res.status(204).end();
  }

  // Reuse the connection and built-in role setup across warm invocations.
  if (!storageReady) {
    storageReady = connectStorage().catch((error) => {
      storageReady = undefined;
      throw error;
    });
  }

  try {
    await storageReady;
    return app(req, res);
  } catch (error) {
    console.error('Vercel API initialization failed:', error);
    // Match the app's reflected-origin CORS policy so the browser can read the
    // database error instead of reporting only a generic CORS failure.
    return res.status(500).json({
      error: { code: 'DATABASE_UNAVAILABLE', message: 'The API could not connect to its database.' }
    });
  }
};

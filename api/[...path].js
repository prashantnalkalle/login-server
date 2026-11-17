// Vercel routes /api/* requests through this serverless function.
// Keep the Express app exported as a handler; do not call app.listen() here.
const app = require('../src/app');
const { connectStorage } = require('../src/storage');

let storageReady;

module.exports = async function handler(req, res) {
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
    return res.status(500).json({
      error: { code: 'DATABASE_UNAVAILABLE', message: 'The API could not connect to its database.' }
    });
  }
};

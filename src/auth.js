const jwt = require('jsonwebtoken');
const crypto = require('node:crypto');
const config = require('./config');
const { User } = require('./models');
const { HttpError } = require('./errors');

function signAccessToken(user) {
  // JWTs are signed and verified with one algorithm, issuer, and audience.
  return jwt.sign(
    { role: user.role },
    config.JWT_SECRET,
    {
      subject: String(user.id),
      issuer: 'login-api',
      audience: 'angular-app',
      expiresIn: config.JWT_EXPIRES_IN,
      algorithm: 'HS256'
    }
  );
}

async function authenticate(req, _res, next) {
  let claims;

  // Reject missing, expired, or incorrectly signed tokens.
  try {
    const [scheme, token] = (req.get('authorization') || '').split(' ');
    if (scheme !== 'Bearer' || !token) throw new Error('Missing token');

    claims = jwt.verify(token, config.JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: 'login-api',
      audience: 'angular-app'
    });
  } catch (_error) {
    return next(new HttpError(401, 'UNAUTHORIZED', 'A valid access token is required.'));
  }

  // Read the user from MongoDB so disabled accounts lose access immediately.
  try {
    const user = await User.findById(claims.sub).select('email active role');

    if (!user || !user.active) throw new Error('Inactive user');
    req.user = { id: user.id, email: user.email, role: user.role };
    next();
  } catch (error) {
    if (error.message === 'Inactive user') {
      return next(new HttpError(401, 'UNAUTHORIZED', 'A valid access token is required.'));
    }
    next(error);
  }
}

function requireSuperAdmin(req, _res, next) {
  if (req.user?.role !== 'superAdmin') {
    return next(new HttpError(403, 'FORBIDDEN', 'Superadmin access is required.'));
  }
  next();
}

function tokenHash(token) {
  // Store only a hash of reset tokens in MongoDB.
  return crypto.createHash('sha256').update(token).digest('hex');
}

module.exports = { authenticate, requireSuperAdmin, signAccessToken, tokenHash };

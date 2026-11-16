const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');

const config = require('./config');
const { User, Role } = require('./models');
const { HttpError, errorHandler } = require('./errors');
const { register, login, forgot, reset, createRole } = require('./validation');
const { authenticate, requireSuperAdmin, signAccessToken, tokenHash } = require('./auth');
const { sendResetLink } = require('./mail');

const app = express();

// Basic security middleware.
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({
  // Reflect any requesting origin so browser clients can make credentialed requests.
  // cors also reflects requested headers and answers OPTIONS preflight requests.
  origin: true,
  credentials: true,
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  maxAge: 600
}));
app.use(express.json({ limit: '10kb' }));
app.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// Limit guessing and password-reset abuse.
const loginLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please try again later.' } }
});

const registrationLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many registration attempts. Please try again later.' } }
});

const passwordResetLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' } }
});

function validate(schema) {
  return (req, _res, next) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      next(error);
    }
  };
}

// Pass errors from async route handlers to Express's error handler.
function asyncRoute(handler) {
  return (req, res, next) => handler(req, res).catch(next);
}

// Public endpoint for checking that the API is running.
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Temporary public registration lets each new account choose a built-in role.
app.post('/api/auth/register', registrationLimit, validate(register), asyncRoute(async (req, res) => {
  const role = await Role.findOne({ name: req.body.role });
  if (!role) throw new HttpError(400, 'ROLE_NOT_FOUND', 'The requested role does not exist.');

  const passwordHash = await bcrypt.hash(req.body.password, config.BCRYPT_ROUNDS);
  const user = await User.create({
    email: req.body.email,
    passwordHash,
    role: role.name
  });

  res.status(201).json({
    accessToken: signAccessToken(user),
    tokenType: 'Bearer',
    expiresIn: config.JWT_EXPIRES_IN,
    userRole: user.role,
    user: { id: user.id, email: user.email, role: user.role }
  });
}));

// Validate credentials and return a signed JWT plus the user's role.
app.post('/api/auth/login', loginLimit, validate(login), asyncRoute(async (req, res) => {
  const user = await User.findOne({ email: req.body.email });

  if (!user) {
    throw new HttpError(404, 'EMAIL_NOT_FOUND', 'No account was found for this email.');
  }

  if (!user.active) {
    throw new HttpError(403, 'ACCOUNT_DISABLED', 'This account is disabled. Contact an administrator.');
  }

  const passwordMatches = await bcrypt.compare(req.body.password, user.passwordHash);
  if (!passwordMatches) {
    throw new HttpError(401, 'PASSWORD_INCORRECT', 'The password is incorrect.');
  }

  res.json({
    accessToken: signAccessToken(user),
    tokenType: 'Bearer',
    expiresIn: config.JWT_EXPIRES_IN,
    userRole: user.role,
    user: { id: user.id, email: user.email, role: user.role }
  });
}));

// Create an expiring, hashed reset token and send it without revealing account existence.
app.post('/api/auth/forgot-password', passwordResetLimit, validate(forgot), asyncRoute(async (req, res) => {
  const user = await User.findOne({ email: req.body.email, active: true });

  if (user) {
    const token = crypto.randomBytes(32).toString('base64url');
    const tokenHashValue = tokenHash(token);
    user.resetTokenHash = tokenHashValue;
    user.resetTokenExpiresAt = new Date(Date.now() + config.RESET_TOKEN_TTL_MINUTES * 60_000);
    await user.save();

    try {
      await sendResetLink(user.email, token);
    } catch (error) {
      // Keep the response the same so callers cannot discover registered emails.
      await User.updateOne(
        { _id: user.id, resetTokenHash: tokenHashValue },
        { $unset: { resetTokenHash: 1, resetTokenExpiresAt: 1 } }
      );
      console.error('Could not send password reset email:', error.message);
    }
  }

  res.json({ message: 'If an account exists for that email, a reset link will be sent.' });
}));

// Verify token and password history, then atomically change the password in MongoDB.
app.post('/api/auth/reset-password', passwordResetLimit, validate(reset), asyncRoute(async (req, res) => {
  const tokenHashValue = tokenHash(req.body.token);
  const user = await User.findOne({
    resetTokenHash: tokenHashValue,
    resetTokenExpiresAt: { $gt: new Date() }
  });

  if (!user) {
    throw new HttpError(400, 'RESET_TOKEN_INVALID', 'The reset link is invalid or expired.');
  }

  const previousPasswords = [
    user.passwordHash,
    ...user.passwordHistory.map((entry) => entry.passwordHash)
  ];

  for (const oldHash of previousPasswords) {
    if (await bcrypt.compare(req.body.password, oldHash)) {
      throw new HttpError(400, 'PASSWORD_REUSED', 'Choose a password you have not used in your last 5 passwords.');
    }
  }

  const newPasswordHash = await bcrypt.hash(req.body.password, config.BCRYPT_ROUNDS);

  // This atomic update makes a reset token single-use, even for simultaneous requests.
  const updatedUser = await User.findOneAndUpdate(
    {
      _id: user.id,
      resetTokenHash: tokenHashValue,
      resetTokenExpiresAt: { $gt: new Date() },
      passwordHash: user.passwordHash
    },
    {
      $set: { passwordHash: newPasswordHash },
      $push: {
        passwordHistory: {
          $each: [{ passwordHash: user.passwordHash }],
          $slice: -4
        }
      },
      $unset: { resetTokenHash: 1, resetTokenExpiresAt: 1 }
    },
    { new: true }
  );

  if (!updatedUser) {
    throw new HttpError(400, 'RESET_TOKEN_INVALID', 'The reset link is invalid or expired.');
  }

  res.json({ message: 'Password reset successfully.' });
}));

// Return identity from the current database record, not only the JWT claims.
app.get('/api/auth/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

// Let signed-in users load roles for the application UI.
app.get('/api/roles', authenticate, asyncRoute(async (_req, res) => {
  const roles = await Role.find().sort({ name: 1 }).select('name -_id');
  res.json({ roles: roles.map(({ name }) => name) });
}));

// Only superadmins may add role names.
app.post('/api/roles', authenticate, requireSuperAdmin, validate(createRole), asyncRoute(async (req, res) => {
  const role = await Role.create({ name: req.body.name });
  res.status(201).json({ role: { id: role.id, name: role.name } });
}));

// Temporary registration alias for clients that use the existing /api/users path.
app.post('/api/users', registrationLimit, validate(register), asyncRoute(async (req, res) => {
  const role = await Role.findOne({ name: req.body.role });
  if (!role) throw new HttpError(400, 'ROLE_NOT_FOUND', 'The requested role does not exist.');

  const passwordHash = await bcrypt.hash(req.body.password, config.BCRYPT_ROUNDS);
  const user = await User.create({ email: req.body.email, passwordHash, role: role.name });

  res.status(201).json({
    accessToken: signAccessToken(user),
    tokenType: 'Bearer',
    expiresIn: config.JWT_EXPIRES_IN,
    userRole: user.role,
    user: { id: user.id, email: user.email, role: user.role }
  });
}));

app.use((_req, _res, next) => {
  next(new HttpError(404, 'NOT_FOUND', 'Endpoint not found.'));
});
app.use(errorHandler);

module.exports = app;

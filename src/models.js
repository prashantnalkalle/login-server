const mongoose = require('mongoose');

// MongoDB collection for role names. The unique index prevents duplicates.
const roleSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, unique: true }
}, { timestamps: true });

// User credentials, authorization role, password history, and reset-token state.
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true, unique: true },
  passwordHash: { type: String, required: true },
  role: { type: String, required: true },
  active: { type: Boolean, default: true },
  passwordHistory: [{
    passwordHash: { type: String, required: true },
    changedAt: { type: Date, default: Date.now }
  }],
  resetTokenHash: String,
  resetTokenExpiresAt: Date
}, { timestamps: true });

module.exports = {
  Role: mongoose.model('Role', roleSchema),
  User: mongoose.model('User', userSchema)
};

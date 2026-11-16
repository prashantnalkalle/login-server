// MongoDB connection and startup data setup live here.
const mongoose = require('mongoose');
const config = require('./config');
const { Role } = require('./models');

async function connectStorage() {
  // Mongoose connects to the database named in MONGODB_URI.
  await mongoose.connect(config.MONGODB_URI);

  // Add built-in roles once. Existing roles are left unchanged.
  const builtInRoles = ['buyer', 'admin', 'superAdmin'];
  await Role.bulkWrite(builtInRoles.map((name) => ({
    updateOne: {
      filter: { name },
      update: { $setOnInsert: { name } },
      upsert: true
    }
  })));
}

module.exports = { connectStorage, mongoose };

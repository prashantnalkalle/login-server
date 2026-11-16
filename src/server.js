require('dotenv').config();

const bcrypt = require('bcryptjs');
const config = require('./config');
const { connectStorage, mongoose } = require('./storage');
const { Role, User } = require('./models');
const app = require('./app');

async function createFirstSuperAdmin() {
  // Never overwrite or recreate the bootstrap account after the first user exists.
  if (await User.exists({})) return;

  if (!config.SUPERADMIN_EMAIL || !config.SUPERADMIN_PASSWORD) {
    throw new Error('Set SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD for the first startup.');
  }

  const role = await Role.findOne({ name: 'superAdmin' });
  const passwordHash = await bcrypt.hash(config.SUPERADMIN_PASSWORD, config.BCRYPT_ROUNDS);

  await User.create({
    email: config.SUPERADMIN_EMAIL.toLowerCase(),
    passwordHash,
    role: role.name
  });

  console.info(`Created first superadmin: ${config.SUPERADMIN_EMAIL}`);
}

async function startServer() {
  // Connect and seed roles before accepting API requests.
  await connectStorage();
  await createFirstSuperAdmin();

  const server = app.listen(config.PORT, () => {
    console.info(`Auth API listening on port ${config.PORT}`);
  });

  // Close HTTP requests and MongoDB cleanly on process shutdown.
  function shutDown() {
    server.close(async () => {
      await mongoose.disconnect();
      process.exit(0);
    });
  }

  process.on('SIGINT', shutDown);
  process.on('SIGTERM', shutDown);
}

startServer().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

/**
 * Create (or update) the first super-admin account out-of-band.
 * Public admin registration is disabled, so use this once to bootstrap access.
 *
 * Usage:
 *   node seedAdmin.js "Admin Name" admin@example.com "StrongPassword123"
 * or set env vars ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD and run:
 *   node seedAdmin.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Admin = require('./models/Admin');

async function run() {
  const name = process.argv[2] || process.env.ADMIN_NAME;
  const email = process.argv[3] || process.env.ADMIN_EMAIL;
  const password = process.argv[4] || process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.error('Usage: node seedAdmin.js "Name" email@example.com "password"');
    process.exit(1);
  }
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is not set. Configure backend/.env first.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI, { family: 4 });
  console.log('MongoDB connected.');

  let admin = await Admin.findOne({ email });
  if (admin) {
    admin.password = password; // pre-save hook re-hashes
    admin.role = 'super admin';
    if (name) admin.name = name;
    await admin.save();
    console.log(`Updated existing admin: ${email} (role: super admin)`);
  } else {
    admin = await Admin.create({
      name: name || 'Super Admin',
      email,
      password,
      role: 'super admin'
    });
    console.log(`Created super admin: ${email}`);
  }

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error('Failed to seed admin:', err.message);
  process.exit(1);
});

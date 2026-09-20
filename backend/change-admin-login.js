require('dotenv').config();
const mongoose = require('mongoose');
const Admin = require('./models/Admin');

const NEW_EMAIL = 'admin@borro.in';
const NEW_PASSWORD = 'QQcc65@#';

async function updateAdminCredentials() {
  if (!process.env.MONGODB_URI) {
    console.error('Error: MONGODB_URI is not set in your .env file.');
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB. Searching for admin user...');

    // Find the first admin user in the system
    const admin = await Admin.findOne();
    
    if (!admin) {
        console.log('No admin user found. You might need to use the register endpoint.');
        process.exit(1);
    }
    
    // Update the credentials
    admin.email = NEW_EMAIL;
    admin.password = NEW_PASSWORD;
    
    // Mongoose 'pre-save' hook will automatically hash the new password
    await admin.save();
    
    console.log('\n✅ Successfully updated Admin credentials!');
    console.log(`New Email: ${NEW_EMAIL}`);
    console.log(`New Password: ${NEW_PASSWORD}`);
    
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

updateAdminCredentials();

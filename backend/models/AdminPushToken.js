const mongoose = require('mongoose');

const adminPushTokenSchema = new mongoose.Schema(
  {
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      required: true,
      index: true
    },
    token: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    device: {
      type: String,
      default: 'Unknown Device',
      trim: true
    },
    userAgent: {
      type: String,
      default: '',
      trim: true
    },
    enabled: {
      type: Boolean,
      default: true,
      index: true
    },
    lastUsedAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

// Compound index to quickly fetch all enabled tokens for active admins
adminPushTokenSchema.index({ enabled: 1, adminId: 1 });

module.exports = mongoose.model('AdminPushToken', adminPushTokenSchema);

const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    unique: true,
    maxlength: 254
  },

  passwordHash: {
    type: String,
    required: true,
    select: false
  },

  role: {
    type: String,
    required: true,
    enum: ['national', 'province', 'district']
  },

  provinceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Province',
    default: null
  },

  districtId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'District',
    default: null
  },

  managementEnabled: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  versionKey: false
});

// Validate user jurisdiction based on role
schema.pre('validate', function validateJurisdiction() {

  if (this.role === 'national' && (this.provinceId || this.districtId)) {
    this.invalidate('provinceId', 'National users must not have a geographic scope.');
  }

  if (this.role === 'province' && (!this.provinceId || this.districtId)) {
    this.invalidate('provinceId', 'Province users require a province and no district.');
  }

  if (this.role === 'district' && (!this.districtId || this.provinceId)) {
    this.invalidate('districtId', 'District users require a district and no province.');
  }
});

module.exports = mongoose.model('User', schema);

const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  code: { type: String, required: true, trim: true, uppercase: true, maxlength: 12 },
  provinceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Province', required: true, index: true }
}, { timestamps: true, versionKey: 'version' });
schema.index({ provinceId: 1, code: 1 }, { unique: true });

module.exports = mongoose.model('District', schema);

const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  code: { type: String, required: true, trim: true, uppercase: true, maxlength: 12, unique: true }
}, { timestamps: true, versionKey: 'version' });

module.exports = mongoose.model('Province', schema);

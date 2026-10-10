const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  code: { type: String, required: true, trim: true, uppercase: true, maxlength: 20 },
  districtId: { type: mongoose.Schema.Types.ObjectId, ref: 'District', required: true, index: true }
}, { timestamps: true, versionKey: 'version' });
schema.index({ districtId: 1, code: 1 }, { unique: true });

module.exports = mongoose.model('GridSubstation', schema);

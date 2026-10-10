const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  meterId: { type: String, required: true, trim: true, uppercase: true, maxlength: 64, unique: true },
  substationId: { type: mongoose.Schema.Types.ObjectId, ref: 'GridSubstation', required: true, index: true },
  capacityKw: { type: Number, required: true, min: 0.1, max: 100000 },
  deviceSecretHash: { type: String, required: true, select: false }
}, { timestamps: true, versionKey: 'version' });

module.exports = mongoose.model('SolarInstallation', schema);

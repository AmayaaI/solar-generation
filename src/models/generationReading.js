const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  installationId: { type: mongoose.Schema.Types.ObjectId, ref: 'SolarInstallation', required: true },
  timestamp: { type: Date, required: true },
  instantaneousPowerKw: { type: Number, required: true, min: 0 },
  cumulativeEnergyKwh: { type: Number, required: true, min: 0 },
  voltage: { type: Number, required: true, min: 180, max: 260 }
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false });

schema.index({ installationId: 1, timestamp: -1 }, { unique: true });
schema.index({ timestamp: -1 });

module.exports = mongoose.model('GenerationReading', schema);

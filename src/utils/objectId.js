const mongoose = require('mongoose');

function isObjectId(value) {
  return typeof value === 'string' && /^[a-f\d]{24}$/i.test(value) && mongoose.Types.ObjectId.isValid(value);
}

module.exports = { isObjectId };

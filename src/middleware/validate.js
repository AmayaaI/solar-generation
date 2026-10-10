const AppError = require('../utils/appError');

function validate(schema, source = 'body') {
  return function validateRequest(req, res, next) {
    const { error, value } = schema.validate(req[source], {
      abortEarly: false,
      convert: true,
      allowUnknown: false,
      stripUnknown: false
    });
    if (error) {
      const details = error.details.map(item => ({
        field: item.path.join('.') || (source === 'body' ? 'body' : source),
        message: item.message.replace(/"/g, '')
      }));
      return next(new AppError(400, 'VALIDATION_ERROR', 'The request contains invalid data.', details));
    }
    if (source === 'query') req.validatedQuery = value;
    else req[source] = value;
    return next();
  };
}

module.exports = validate;

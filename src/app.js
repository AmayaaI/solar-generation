const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yaml');
const mongoose = require('mongoose');
const { config } = require('./config/env');
const authRoutes = require('./routes/authRoutes');
const apiRoutes = require('./routes/apiRoutes');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const AppError = require('./utils/appError');

const app = express();
if (config.trustProxy) app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: config.corsOrigins.length ? config.corsOrigins : false, credentials: false }));
app.use(express.json({ limit: '1mb', strict: true }));

const openapiPath = path.join(__dirname, 'docs', 'openapi.yaml');
const openapi = YAML.parse(fs.readFileSync(openapiPath, 'utf8'));
app.get('/', requireJsonAccept, (req, res) => res.json({
  name: openapi.info.title,
  version: openapi.info.version,
  apiBase: '/api/v1',
  links: {
    documentation: '/api-docs',
    openapi: '/openapi.json',
    health: '/health'
  }
}));
app.get('/openapi.json', (req, res) => res.json(openapi));
app.use('/api-docs', (req, res, next) => {
  res.set('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'");
  next();
});
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openapi, { explorer: true }));

function requireJsonAccept(req, res, next) {
  if (!req.accepts('application/json')) return next(new AppError(406, 'NOT_ACCEPTABLE', 'This API returns application/json representations.'));
  return next();
}

app.get('/health', requireJsonAccept, (req, res) => {
  const connected = mongoose.connection.readyState === 1;
  return res.status(connected ? 200 : 503).json({ status: connected ? 'ok' : 'unavailable', database: connected ? 'connected' : 'disconnected' });
});
app.use('/api/v1', requireJsonAccept);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1', apiRoutes);
app.use(notFound);
app.use(errorHandler);

module.exports = app;

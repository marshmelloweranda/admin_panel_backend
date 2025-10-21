const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const applicationRoutes = require('./Routes/AppRoutes');
require('dotenv').config();

const app = express();
const router = express.Router();
const PORT = process.env.PORT || 5000;

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000,
});

// Middleware
app.use(helmet());
//app.use(limiter);
//app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// CORS config
app.use(cors({
  origin: ['https://dmt.digieconcenter.gov.lk/admin','https://dmt.digieconcenter.gov.lk', 'http://127.0.0.1:3008', 'http://localhost:3008'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// --- All routes under /aapi ---
router.get('/test', (req, res) => {
  res.json({ message: 'Backend is working!', timestamp: new Date().toISOString() });
});

router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'Application Admin API'
  });
});

router.use('/applications', applicationRoutes);

// Mount the router
app.use('/aapi', router);

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/aapi/health`);
  console.log(`🔗 Test endpoint: http://localhost:${PORT}/aapi/test`);
  console.log(`📋 Applications API: http://localhost:${PORT}/aapi/applications`);
});

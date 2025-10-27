const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// --- Swagger Imports ---
const swaggerJSDoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const app = express();
const PORT = process.env.PORT || 5000;

// --- Swagger Configuration ---
const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'Application Admin API',
    version: '1.0.0',
    description: 'API for managing driving licence applications',
  },
  servers: [
    {
      url: `http://localhost:${PORT}`,
      description: 'Development server',
    },
  ],
};

const options = {
  swaggerDefinition,
  // Path to the API docs files (your routes)
  apis: ['./Routes/Applications.js'], 
};

const swaggerSpec = swaggerJSDoc(options);
// --- End Swagger Configuration ---

// Enhanced CORS configuration
app.use(cors({
  origin: ['http://dmt.digieconcenter.gov.lk/aapi', 'http://127.0.0.1:3008', 'http://localhost:3008'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization','Accept']
}));

app.use(express.json({ limit: '10mb' })); // Add this line
app.use(express.urlencoded({ extended: true, limit: '10mb' })); // And this line
// Middleware
app.use(helmet());
app.use(express.urlencoded({ extended: true }));

// Test route to check body parsing
app.post('/test-body', (req, res) => {
  console.log('Test body endpoint called');
  console.log('Headers:', req.headers);
  console.log('Body:', req.body);
  console.log('Body type:', typeof req.body);
  res.json({ 
    received: true, 
    body: req.body,
    bodyType: typeof req.body,
    headers: req.headers 
  });
});


// --- Serve Swagger Docs ---
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Test route
app.get('/api/test', (req, res) => {
  res.json({ message: 'Backend is working!', timestamp: new Date().toISOString() });
});

// Routes
// Note: Corrected path to include a leading '/'
app.use('/aapi/applications', require('./Routes/Applications'));

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'Application Admin API'
  });
});

// Error handling middleware
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

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📚 Swagger Docs: http://localhost:${PORT}/api-docs`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔗 Test endpoint: http://localhost:${PORT}/api/test`);
  console.log(`📋 Applications API: http://localhost:${PORT}/admin/aapi/applications`);
});
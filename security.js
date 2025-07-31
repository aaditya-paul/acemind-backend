require('dotenv').config();
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// Environment variables with defaults
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');
const API_KEY = process.env.API_KEY || crypto.randomBytes(32).toString('hex');
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS ? 
  process.env.ALLOWED_ORIGINS.split(',') : 
  ['http://localhost:3000', 'http://127.0.0.1:3000'];

// Rate limiting middleware
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict rate limiting for submit endpoint
const submitLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // Limit each IP to 5 requests per minute for submit
  message: {
    success: false,
    message: 'Too many submit requests, please wait before trying again.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (ALLOWED_ORIGINS.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
};

// API Key middleware
const requireApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey) {
    return res.status(401).json({
      success: false,
      message: 'API key is required',
    });
  }
  
  if (apiKey !== API_KEY) {
    return res.status(401).json({
      success: false,
      message: 'Invalid API key',
    });
  }
  
  next();
};

// JWT Authentication middleware (optional for future use)
const verifyToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1]; // Bearer <token>
  
  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Access token is required',
    });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token',
    });
  }
};

// Request validation middleware
const validateRequest = (req, res, next) => {
  // Check content type
  if (req.method === 'POST' && !req.is('application/json')) {
    return res.status(400).json({
      success: false,
      message: 'Content-Type must be application/json',
    });
  }
  
  // Basic request size validation (already handled by express.json limit)
  next();
};

// Security headers middleware
const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
});

// Input sanitization middleware
const sanitizeInput = (req, res, next) => {
  if (req.body) {
    for (const key in req.body) {
      if (typeof req.body[key] === 'string') {
        // Remove potential XSS patterns
        req.body[key] = req.body[key]
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/javascript:/gi, '')
          .replace(/on\w+=/gi, '');
      }
    }
  }
  next();
};

// Logging middleware for security events
const securityLogger = (req, res, next) => {
  const timestamp = new Date().toISOString();
  const ip = req.ip || req.connection.remoteAddress;
  const userAgent = req.get('User-Agent') || 'Unknown';
  
  console.log(`[${timestamp}] ${req.method} ${req.path} - IP: ${ip} - User-Agent: ${userAgent}`);
  next();
};

module.exports = {
  apiLimiter,
  submitLimiter,
  corsOptions,
  requireApiKey,
  verifyToken,
  validateRequest,
  securityHeaders,
  sanitizeInput,
  securityLogger,
  JWT_SECRET,
  API_KEY,
};

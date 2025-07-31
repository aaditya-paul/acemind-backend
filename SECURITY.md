// Security Configuration Guide

## Environment Variables
Make sure to set these environment variables in your .env file:

### Required Variables:
- `JWT_SECRET`: A strong secret key for JWT tokens (64+ characters recommended)
- `API_KEY`: API key for client authentication
- `ALLOWED_ORIGINS`: Comma-separated list of allowed origins for CORS

### Optional Variables:
- `PORT`: Server port (default: 8000)
- `NODE_ENV`: Environment (development/production)
- `JWT_EXPIRES_IN`: JWT token expiration time (default: 24h)

## Authentication Methods

### 1. API Key Authentication
Add the API key to your requests in one of these ways:
- Header: `X-API-Key: your-api-key-here`
- Query parameter: `?apiKey=your-api-key-here`

### 2. JWT Token Authentication
1. Login to get a JWT token
2. Include the token in the Authorization header: `Authorization: Bearer your-jwt-token`

## Rate Limiting
- Default: 100 requests per 15 minutes per IP
- Configurable through environment variables

## Security Features Implemented

### Headers Security
- Helmet.js for security headers
- Content Security Policy (CSP)
- HSTS (HTTP Strict Transport Security)
- X-Frame-Options, X-Content-Type-Options, etc.

### Input Validation
- Request body validation using express-validator
- XSS protection through input sanitization
- Length limits on inputs

### CORS Protection
- Configurable allowed origins
- Credentials support
- Preflight request handling

## Usage Examples

### Get JWT Token
```javascript
POST /api/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "admin123"
}
```

### Access Protected Endpoint with API Key
```javascript
POST /api/submit
X-API-Key: your-api-key-here
Content-Type: application/json

{
  "topic": "Machine Learning",
  "syllabus": "Introduction to ML algorithms",
  "aiProvider": "gemini"
}
```

### Access Protected Endpoint with JWT
```javascript
POST /api/submit
Authorization: Bearer your-jwt-token
Content-Type: application/json

{
  "topic": "Machine Learning",
  "syllabus": "Introduction to ML algorithms",
  "aiProvider": "gemini"
}
```

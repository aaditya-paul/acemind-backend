const bcrypt = require('bcryptjs');
const { generateToken } = require('./security');

// In a real application, these would be stored in a database
// For demo purposes, we'll use an in-memory store
const users = new Map();

// Default admin user (in production, this should be created through a secure setup process)
const createDefaultUser = async () => {
  const hashedPassword = await bcrypt.hash('admin123', 10);
  users.set('admin', {
    username: 'admin',
    password: hashedPassword,
    role: 'admin',
    created: new Date()
  });
};

// Initialize default user
createDefaultUser();

// User registration (for demo - in production, this would have more restrictions)
const registerUser = async (username, password, role = 'user') => {
  if (users.has(username)) {
    throw new Error('User already exists');
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = {
    username,
    password: hashedPassword,
    role,
    created: new Date()
  };

  users.set(username, user);
  return { username, role, created: user.created };
};

// User authentication
const authenticateUser = async (username, password) => {
  const user = users.get(username);
  if (!user) {
    throw new Error('Invalid credentials');
  }

  const isValidPassword = await bcrypt.compare(password, user.password);
  if (!isValidPassword) {
    throw new Error('Invalid credentials');
  }

  return {
    username: user.username,
    role: user.role
  };
};

// Generate session token
const generateSessionToken = (user) => {
  return generateToken({
    username: user.username,
    role: user.role,
    iat: Math.floor(Date.now() / 1000)
  });
};

module.exports = {
  registerUser,
  authenticateUser,
  generateSessionToken,
  users // Export for testing purposes - remove in production
};

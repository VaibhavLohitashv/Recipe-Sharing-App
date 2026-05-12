import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import crypto from 'crypto';

// SECURITY: Ensure JWT secret is securely generated and required
const JWT_SECRET = (() => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not set');
  }
  return secret;
})();

export const generateToken = (user) => {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '1d' }
  );
};

export const hashPassword = async (password) => {
  return await bcrypt.hash(password, 10);
};

export const comparePasswords = async (password, hashedPassword) => {
  return await bcrypt.compare(password, hashedPassword);
};

export const getUser = async (token) => {
  if (!token) return null;
  
  try {
    // SECURITY: Strict token format validation
    if (!/^Bearer\s[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/.test(token)) {
      throw new Error('Invalid token format');
    }

    const decoded = jwt.verify(token.replace('Bearer ', ''), JWT_SECRET);
    
    // SECURITY: Additional payload validation
    if (!decoded.id || !decoded.email) {
      throw new Error('Invalid token payload');
    }

    return await User.findById(decoded.id);
  } catch (error) {
    console.warn('Token verification failed:', error.message);
    return null;
  }
};
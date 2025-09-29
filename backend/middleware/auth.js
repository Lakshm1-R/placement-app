const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
  console.log('=== AUTH MIDDLEWARE DEBUG ===');
  
  const authHeader = req.header('Authorization');
  console.log('Headers:', authHeader);
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log('No valid authorization header');
    return res.status(401).json({ message: 'No token, authorization denied' });
  }

  const token = authHeader.replace('Bearer ', '');
  console.log('Extracted token:', token ? 'Token exists' : 'No token');
  
  if (!token || token === 'null' || token === 'undefined' || token.trim() === '') {
    console.log('Token is null, undefined, or empty');
    return res.status(401).json({ message: 'No token, authorization denied' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
    console.log('Decoded token:', decoded);
    
    const user = await User.findById(decoded.userId);
    console.log('Found user:', user ? user.email : 'No user found');
    
    if (!user) {
      console.log('User not found in database');
      return res.status(401).json({ message: 'Token is not valid' });
    }

    req.user = user;
    console.log('Auth successful for:', user.email);
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({ message: 'Token is not valid' });
  }
};

module.exports = { auth };







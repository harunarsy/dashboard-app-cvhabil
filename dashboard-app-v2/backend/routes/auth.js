const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const pool = require('../config/database');

// Login endpoint
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  
  try {
    // Demo auth - replace with proper password hashing later
    if (username === 'admin' && password === 'admin123') {
      const token = jwt.sign(
        { id: 1, username: 'admin', role: 'admin' },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRE }
      );
      
      return res.json({ 
        token, 
        user: { id: 1, username: 'admin', role: 'admin' } 
      });
    }
    
    res.status(401).json({ error: 'Invalid credentials' });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Logout endpoint
router.post('/logout', (req, res) => {
  res.json({ message: 'Logged out successfully' });
});

module.exports = router;
import express from 'express';
import jwt from 'jsonwebtoken';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import User from '../models/User.js';
import { protect, getClientIP } from '../middleware/auth.js';
import AuditLog from '../models/AuditLog.js';

const router = express.Router();

// Generate JWT Token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d'
  });
};

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    // Validate input
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide all required fields' });
    }

    // Check if user exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ success: false, message: 'User already exists' });
    }

    // Create user
    const user = await User.create({
      name,
      email,
      password,
      role: role || 'customer'
    });

    // Log registration
    await AuditLog.create({
      userId: user._id,
      action: 'CREATE',
      resourceType: 'User',
      resourceId: user._id,
      changes: { name, email, role },
      ipAddress: getClientIP(req),
      userAgent: req.get('user-agent')
    });

    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        mfaEnabled: user.mfaEnabled,
        token
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ success: false, message: 'Server error during registration' });
  }
});

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide email and password' });
    }

    // Find user with password
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Check if MFA is enabled
    if (user.mfaEnabled) {
      return res.status(200).json({
        success: true,
        mfaRequired: true,
        userId: user._id,
        message: 'MFA verification required'
      });
    }

    const token = generateToken(user._id);

    // Log login
    await AuditLog.create({
      userId: user._id,
      action: 'LOGIN',
      resourceType: 'System',
      resourceId: user._id,
      changes: { email },
      ipAddress: getClientIP(req),
      userAgent: req.get('user-agent')
    });

    res.json({
      success: true,
      mfaRequired: false,
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        mfaEnabled: user.mfaEnabled,
        token
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Server error during login' });
  }
});

// @route   POST /api/auth/verify-mfa
// @desc    Verify MFA code
// @access  Public
router.post('/verify-mfa', async (req, res) => {
  try {
    const { userId, token: mfaToken } = req.body;

    if (!userId || !mfaToken) {
      return res.status(400).json({ success: false, message: 'User ID and MFA token required' });
    }

    const user = await User.findById(userId);
    if (!user || !user.mfaEnabled) {
      return res.status(400).json({ success: false, message: 'MFA not enabled for this user' });
    }

    const isValid = authenticator.verify({
      token: mfaToken,
      secret: user.mfaSecret
    });

    if (!isValid) {
      return res.status(401).json({ success: false, message: 'Invalid MFA code' });
    }

    const token = generateToken(user._id);

    // Log login
    await AuditLog.create({
      userId: user._id,
      action: 'LOGIN',
      resourceType: 'System',
      resourceId: user._id,
      changes: { mfaVerified: true },
      ipAddress: getClientIP(req),
      userAgent: req.get('user-agent')
    });

    res.json({
      success: true,
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        mfaEnabled: user.mfaEnabled,
        token
      }
    });
  } catch (error) {
    console.error('MFA verification error:', error);
    res.status(500).json({ success: false, message: 'Server error during MFA verification' });
  }
});

// @route   GET /api/auth/mfa/setup
// @desc    Setup MFA for user
// @access  Private
router.get('/mfa/setup', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (user.mfaEnabled) {
      return res.status(400).json({ success: false, message: 'MFA already enabled' });
    }

    const secret = authenticator.generateSecret();
    const otpauth = authenticator.keyuri(user.email, 'HelpDesk Portal', secret);
    const qrCode = await QRCode.toDataURL(otpauth);

    // Temporarily store secret (will be confirmed on verify)
    user.mfaSecret = secret;
    await user.save();

    res.json({
      success: true,
      data: {
        secret,
        otpauth,
        qrCode
      }
    });
  } catch (error) {
    console.error('MFA setup error:', error);
    res.status(500).json({ success: false, message: 'Server error during MFA setup' });
  }
});

// @route   POST /api/auth/mfa/enable
// @desc    Enable MFA after verification
// @access  Private
router.post('/mfa/enable', protect, async (req, res) => {
  try {
    const { token: mfaToken } = req.body;

    if (!mfaToken) {
      return res.status(400).json({ success: false, message: 'MFA token required' });
    }

    const user = await User.findById(req.user._id);

    if (!user.mfaSecret) {
      return res.status(400).json({ success: false, message: 'Please setup MFA first' });
    }

    const isValid = authenticator.verify({
      token: mfaToken,
      secret: user.mfaSecret
    });

    if (!isValid) {
      return res.status(401).json({ success: false, message: 'Invalid MFA code' });
    }

    user.mfaEnabled = true;
    await user.save();

    // Log MFA enable
    await AuditLog.create({
      userId: user._id,
      action: 'MFA_ENABLE',
      resourceType: 'User',
      resourceId: user._id,
      changes: { mfaEnabled: true },
      ipAddress: getClientIP(req),
      userAgent: req.get('user-agent')
    });

    res.json({
      success: true,
      message: 'MFA enabled successfully',
      data: { mfaEnabled: true }
    });
  } catch (error) {
    console.error('MFA enable error:', error);
    res.status(500).json({ success: false, message: 'Server error enabling MFA' });
  }
});

// @route   POST /api/auth/mfa/disable
// @desc    Disable MFA
// @access  Private
router.post('/mfa/disable', protect, async (req, res) => {
  try {
    const { token: mfaToken } = req.body;

    const user = await User.findById(req.user._id);

    if (!user.mfaEnabled) {
      return res.status(400).json({ success: false, message: 'MFA not enabled' });
    }

    const isValid = authenticator.verify({
      token: mfaToken,
      secret: user.mfaSecret
    });

    if (!isValid) {
      return res.status(401).json({ success: false, message: 'Invalid MFA code' });
    }

    user.mfaEnabled = false;
    user.mfaSecret = null;
    await user.save();

    // Log MFA disable
    await AuditLog.create({
      userId: user._id,
      action: 'MFA_DISABLE',
      resourceType: 'User',
      resourceId: user._id,
      changes: { mfaEnabled: false },
      ipAddress: getClientIP(req),
      userAgent: req.get('user-agent')
    });

    res.json({
      success: true,
      message: 'MFA disabled successfully',
      data: { mfaEnabled: false }
    });
  } catch (error) {
    console.error('MFA disable error:', error);
    res.status(500).json({ success: false, message: 'Server error disabling MFA' });
  }
});

// @route   GET /api/auth/me
// @desc    Get current user
// @access  Private
router.get('/me', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    
    res.json({
      success: true,
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        mfaEnabled: user.mfaEnabled
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

export default router;

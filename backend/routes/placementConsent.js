const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const User = require('../models/User');
const { auth } = require('../middleware/auth');
const { sendOTPEmail } = require('../services/emailService');

const router = express.Router();

// Ensure upload directories exist
const ensureDirectoryExists = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

// Configure multer for signature upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(__dirname, '../uploads/signatures/');
    ensureDirectoryExists(uploadPath);
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    cb(null, `signature_${req.user.id}_${Date.now()}${path.extname(file.originalname)}`);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error('Invalid file type for signature'));
    }
  }
});

// Get placement policy
router.get('/policy', auth, async (req, res) => {
  try {
    // Allow both students and placement representatives
    if (req.user.role !== 'student' && req.user.role !== 'placement_representative') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const placementPolicy = {
      title: "Government College of Technology - Placement Policy",
      content: `PLACEMENT POLICY AND CONDITIONS

1. GENERAL CONDITIONS
- Students must maintain minimum CGPA requirements throughout the placement process
- Students are expected to attend all placement activities punctually
- Professional behavior is mandatory during all interactions with recruiters

2. ELIGIBILITY CRITERIA
- Minimum CGPA as specified by individual companies
- No current backlogs (unless specified otherwise by company)
- Completion of all academic requirements

3. PLACEMENT PROCESS
- Students can apply to multiple companies based on eligibility
- Once selected by a company, students must honor the commitment
- Students cannot withdraw after accepting an offer without valid reasons

4. RESPONSIBILITIES
- Maintain confidentiality of company information
- Represent the college with dignity and professionalism
- Follow all guidelines provided by the placement cell

5. COMPLIANCE
- Violation of any policy may result in disqualification from placement activities
- The placement cell reserves the right to modify policies as needed
- Students must keep their profiles updated with accurate information

By agreeing to this policy, you confirm that you understand and will comply with all the above conditions.`,
      lastUpdated: new Date().toISOString()
    };

    res.json({ policy: placementPolicy });
  } catch (error) {
    console.error('Error fetching placement policy:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Submit placement consent
router.post('/consent', auth, upload.single('signature'), async (req, res) => {
  try {
    console.log('=== CONSENT SUBMISSION ===');
    console.log('User ID:', req.user.id);
    console.log('User Role:', req.user.role);

    // Allow both students and placement representatives
    if (req.user.role !== 'student' && req.user.role !== 'placement_representative') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!user.profile || !user.profile.isProfileComplete) {
      return res.status(403).json({ message: 'Profile must be completed first' });
    }

    const { hasAgreed } = req.body;
    
    if (!hasAgreed || hasAgreed !== 'true') {
      return res.status(400).json({ message: 'Consent agreement is required' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'Signature file is required' });
    }

    // Generate OTP for verification (6-digit)
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = new Date(Date.now() + 2 * 60 * 1000); // 2 minutes

    console.log('Generated OTP:', otpCode);

    // Update user with consent information
    user.placementPolicyConsent = {
      hasAgreed: true,
      agreedAt: new Date(),
      signature: req.file.filename,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    };

    // Ensure verificationStatus exists and update it
    if (!user.verificationStatus) {
      user.verificationStatus = {
        isVerified: false,
        otpVerified: false,
        otpAttempts: 0,
        otpResendCount: 0
      };
    }

    user.verificationStatus.otpCode = otpCode;
    user.verificationStatus.otpExpires = otpExpires;
    user.verificationStatus.otpVerified = false;
    user.verificationStatus.lastOtpSent = new Date();
    user.verificationStatus.otpAttempts = 0; // Reset attempts

    console.log('Before saving - user.verificationStatus:', user.verificationStatus);

    // Use markModified to ensure nested object is saved
    user.markModified('verificationStatus');
    user.markModified('placementPolicyConsent');
    
    await user.save();

    // Send OTP via email
    try {
      await sendOTPEmail(user.email, otpCode, user.name);
      console.log('✅ OTP email sent successfully');
    } catch (emailError) {
      console.error('❌ Failed to send OTP email:', emailError);
      // Continue with the process even if email fails
    }

    res.json({ 
      message: 'Placement policy consent recorded successfully. Please check your email for the OTP verification code.',
      needsOtpVerification: true,
      email: user.email.replace(/(.{2})(.*)(@.*)/, '$1***$3') // Mask email for security
    });
  } catch (error) {
    console.error('Error recording consent:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Verify OTP
router.post('/verify-otp', auth, async (req, res) => {
  try {
    console.log('=== OTP VERIFICATION ===');
    console.log('User ID:', req.user.id);
    console.log('User Role:', req.user.role);

    // Allow both students and placement representatives
    if (req.user.role !== 'student' && req.user.role !== 'placement_representative') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { otpCode } = req.body;
    
    if (!otpCode) {
      return res.status(400).json({ message: 'OTP code is required' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!user.verificationStatus) {
      return res.status(400).json({ message: 'No OTP found. Please request a new one.' });
    }

    // Check if too many attempts
    if (user.verificationStatus.otpAttempts >= 3) {
      return res.status(429).json({ 
        message: 'Too many failed attempts. Please request a new OTP.',
        needsNewOtp: true
      });
    }

    if (!user.verificationStatus.otpCode) {
      return res.status(400).json({ message: 'No OTP found. Please request a new one.' });
    }

    if (user.verificationStatus.otpExpires && user.verificationStatus.otpExpires < new Date()) {
      return res.status(400).json({ 
        message: 'OTP has expired. Please request a new one.',
        expired: true
      });
    }

    // Increment attempt counter
    user.verificationStatus.otpAttempts += 1;
    await user.save();

    console.log('Stored OTP:', user.verificationStatus.otpCode);
    console.log('Received OTP:', otpCode);

    if (user.verificationStatus.otpCode !== otpCode.toString()) {
      const attemptsLeft = 3 - user.verificationStatus.otpAttempts;
      return res.status(400).json({ 
        message: `Invalid OTP code. ${attemptsLeft} attempts remaining.`,
        attemptsLeft: attemptsLeft
      });
    }

    // Update verification status
    user.verificationStatus.otpVerified = true;
    user.verificationStatus.isVerified = true;
    user.verificationStatus.verifiedAt = new Date();
    user.verificationStatus.otpCode = undefined;
    user.verificationStatus.otpExpires = undefined;
    user.verificationStatus.otpAttempts = 0;

    await user.save();

    console.log('✅ OTP verified successfully');

    res.json({ 
      message: 'OTP verified successfully. You can now access the dashboard.',
      verified: true
    });
  } catch (error) {
    console.error('Error verifying OTP:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Resend OTP
router.post('/resend-otp', auth, async (req, res) => {
  try {
    console.log('=== RESEND OTP ===');
    console.log('User ID:', req.user.id);

    // Allow both students and placement representatives
    if (req.user.role !== 'student' && req.user.role !== 'placement_representative') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!user.placementPolicyConsent || !user.placementPolicyConsent.hasAgreed) {
      return res.status(400).json({ message: 'Please complete placement consent first' });
    }

    // Check resend limits (max 3 resends per session)
    if (user.verificationStatus?.otpResendCount >= 3) {
      return res.status(429).json({ 
        message: 'Maximum resend limit reached. Please try again later or contact support.',
        maxLimitReached: true
      });
    }

    // Check if last OTP was sent less than 30 seconds ago
    if (user.verificationStatus?.lastOtpSent) {
      const timeSinceLastOtp = Date.now() - user.verificationStatus.lastOtpSent.getTime();
      if (timeSinceLastOtp < 30000) { // 30 seconds
        const waitTime = Math.ceil((30000 - timeSinceLastOtp) / 1000);
        return res.status(429).json({ 
          message: `Please wait ${waitTime} seconds before requesting a new OTP.`,
          waitTime: waitTime
        });
      }
    }

    // Generate new OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = new Date(Date.now() + 2 * 60 * 1000); // 2 minutes

    console.log('Generated new OTP:', otpCode);

    // Initialize verificationStatus if it doesn't exist
    if (!user.verificationStatus) {
      user.verificationStatus = {
        otpResendCount: 0,
        otpAttempts: 0
      };
    }

    user.verificationStatus.otpCode = otpCode;
    user.verificationStatus.otpExpires = otpExpires;
    user.verificationStatus.otpVerified = false;
    user.verificationStatus.lastOtpSent = new Date();
    user.verificationStatus.otpAttempts = 0; // Reset attempts
    user.verificationStatus.otpResendCount = (user.verificationStatus.otpResendCount || 0) + 1;

    await user.save();

    // Send OTP via email
    try {
      await sendOTPEmail(user.email, otpCode, user.name);
      console.log('✅ New OTP email sent successfully');
    } catch (emailError) {
      console.error('❌ Failed to send OTP email:', emailError);
      return res.status(500).json({ message: 'Failed to send OTP email. Please try again.' });
    }

    const remainingResends = 3 - user.verificationStatus.otpResendCount;

    res.json({ 
      message: 'New OTP sent to your email successfully.',
      email: user.email.replace(/(.{2})(.*)(@.*)/, '$1***$3'),
      remainingResends: remainingResends
    });
  } catch (error) {
    console.error('Error resending OTP:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Check consent status
router.get('/status', auth, async (req, res) => {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      profileComplete: user.profile?.isProfileComplete || false,
      consentGiven: user.placementPolicyConsent?.hasAgreed || false,
      consentDate: user.placementPolicyConsent?.agreedAt,
      otpVerified: user.verificationStatus?.otpVerified || false,
      isVerified: user.verificationStatus?.isVerified || false,
      canAccessDashboard: (user.profile?.isProfileComplete || false) && 
                         (user.placementPolicyConsent?.hasAgreed || false) && 
                         (user.verificationStatus?.otpVerified || false)
    });
  } catch (error) {
    console.error('Error checking consent status:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;














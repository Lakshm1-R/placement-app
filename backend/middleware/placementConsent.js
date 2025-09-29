const User = require('../models/User');

const requirePlacementConsent = async (req, res, next) => {
  try {
    // Only apply to students and placement representatives
    if (req.user.role !== 'student' && req.user.role !== 'placement_representative') {
      return next();
    }
    
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    if (!user.profile || !user.profile.isProfileComplete) {
      return res.status(403).json({ 
        message: 'Profile completion required',
        needsProfileCompletion: true
      });
    }
    
    if (!user.placementPolicyConsent || !user.placementPolicyConsent.hasAgreed) {
      return res.status(403).json({ 
        message: 'Placement policy consent required',
        needsPlacementConsent: true
      });
    }

    if (!user.verificationStatus || !user.verificationStatus.otpVerified) {
      return res.status(403).json({ 
        message: 'OTP verification required',
        needsOtpVerification: true
      });
    }
    
    next();
  } catch (error) {
    console.error('Placement consent middleware error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { requirePlacementConsent };





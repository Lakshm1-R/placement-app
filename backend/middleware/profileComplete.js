const User = require('../models/User');

const requireCompleteProfile = async (req, res, next) => {
  try {
    // Only apply to students
    if (req.user.role !== 'student') {
      return next();
    }
    
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Calculate current completion status
    user.calculateProfileCompletion();
    await user.save();
    
    if (!user.profile.isProfileComplete) {
      return res.status(403).json({ 
        message: 'Profile completion required',
        needsProfileCompletion: true,
        completionPercentage: user.profile.profileCompletionPercentage,
        missingFields: user.getMissingProfileFields()
      });
    }
    
    next();
  } catch (error) {
    console.error('Profile complete middleware error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { requireCompleteProfile };




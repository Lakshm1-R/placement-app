const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { 
    type: String, 
    enum: ['student', 'placement_officer', 'placement_representative', 'admin', 'po', 'pr'], 
    required: true 
  },
  isVerified: { type: Boolean, default: false },
  verificationToken: String,
  verificationTokenExpires: Date,
  resetPasswordToken: String,
  resetPasswordExpires: Date,
  
  // Placement Policy Consent
  placementPolicyConsent: {
    hasAgreed: { type: Boolean, default: false },
    agreedAt: { type: Date },
    signature: { type: String },
    consentPdfPath: { type: String },
    ipAddress: { type: String },
    userAgent: { type: String }
  },
  
  // OTP Verification Status
  verificationStatus: {
    isVerified: { type: Boolean, default: false },
    otpCode: { type: String },
    otpExpires: { type: Date },
    otpVerified: { type: Boolean, default: false },
    verifiedAt: { type: Date },
    otpAttempts: { type: Number, default: 0 },
    lastOtpSent: { type: Date },
    otpResendCount: { type: Number, default: 0 }
  },
  
  profile: {
    // Basic Info
    name: {
      type: String,
      required: function() { 
        return this.parent().role === 'student' && this.parent().isProfileBeingCompleted;
      }
    },
    rollNumber: {
      type: String,
      required: function() { 
        return this.parent().role === 'student' && this.parent().isProfileBeingCompleted;
      }
    },
    registerNo: {
      type: String
    },
    
    // New fields
    gender: {
      type: String,
      enum: ['Male', 'Female', 'Other'],
      required: function() { 
        return this.parent().role === 'student' && this.parent().isProfileBeingCompleted;
      }
    },
    dateOfBirth: {
      type: Date,
      required: function() { 
        return this.parent().role === 'student' && this.parent().isProfileBeingCompleted;
      }
    },
    personalEmail: {
      type: String,
      required: function() { 
        return this.parent().role === 'student' && this.parent().isProfileBeingCompleted;
      }
    },
    collegeEmail: {
      type: String,
      required: function() { 
        return this.parent().role === 'student' && this.parent().isProfileBeingCompleted;
      }
    },
    tenthPercentage: {
      type: Number,
      min: 0,
      max: 100,
      required: function() { 
        return this.parent().role === 'student' && this.parent().isProfileBeingCompleted;
      }
    },
    twelfthPercentage: {
      type: Number,
      min: 0,
      max: 100,
      required: function() { 
        return this.parent().role === 'student' && this.parent().isProfileBeingCompleted;
      }
    },
    diplomaPercentage: {
      type: Number,
      min: 0,
      max: 100
    },
    
    degree: {
      type: String,
      enum: ['B.E', 'B.TECH'],
      required: function() { 
        return this.parent().role === 'student' && this.parent().isProfileBeingCompleted;
      }
    },
    department: {
      type: String,
      required: function() { 
        return this.parent().role === 'student' && this.parent().isProfileBeingCompleted;
      }
    },
    graduationYear: {
      type: Number,
      required: function() { 
        return this.parent().role === 'student' && this.parent().isProfileBeingCompleted;
      }
    },
    cgpa: {
      type: Number,
      min: 0,
      max: 10,
      required: function() { 
        return this.parent().role === 'student' && this.parent().isProfileBeingCompleted;
      }
    },
    address: {
      type: String,
      required: function() { 
        return this.parent().role === 'student' && this.parent().isProfileBeingCompleted;
      }
    },
    phoneNumber: {
      type: String,
      required: function() { 
        return this.parent().role === 'student' && this.parent().isProfileBeingCompleted;
      },
      validate: {
        validator: function(v) {
          return /^\d{10}$/.test(v);
        },
        message: 'Phone number must be 10 digits'
      }
    },
    linkedinUrl: {
      type: String,
      required: function() { 
        return this.parent().role === 'student' && this.parent().isProfileBeingCompleted;
      },
      validate: {
        validator: function(v) {
          return /^https:\/\/(www\.)?linkedin\.com\/in\/[a-zA-Z0-9-]+\/?$/.test(v);
        },
        message: 'Please provide a valid LinkedIn profile URL'
      }
    },
    githubUrl: {
      type: String,
      required: function() { 
        return this.parent().role === 'student' && 
               ['Computer Science', 'Information Technology'].includes(this.department);
      },
      validate: {
        validator: function(v) {
          if (!v) return true; // Optional for non-CSE/IT
          return /^https:\/\/(www\.)?github\.com\/[a-zA-Z0-9-]+\/?$/.test(v);
        },
        message: 'Please provide a valid GitHub profile URL'
      }
    },
    
    // Files
    photo: {
      type: String,
      required: function() { 
        return this.parent().role === 'student' && this.parent().isProfileBeingCompleted;
      }
    },
    marksheets: {
      type: [String],
      required: function() { 
        return this.parent().role === 'student' && this.parent().isProfileBeingCompleted;
      },
      validate: {
        validator: function(v) {
          if (this.parent().role !== 'student' || !this.parent().isProfileBeingCompleted) return true;
          return v && v.length > 0;
        },
        message: 'At least one marksheet is required'
      }
    },
    collegeIdCard: {
      type: String,
      required: function() { 
        return this.parent().role === 'student' && this.parent().isProfileBeingCompleted;
      }
    },
    resume: {
      type: String,
      required: function() { 
        return this.parent().role === 'student' && this.parent().isProfileBeingCompleted;
      }
    },
    
    // Academic Info
    currentBacklogs: {
      type: Number,
      default: 0,
      required: function() { return this.parent().role === 'student'; }
    },
    historyOfBacklogs: [{
      subject: {
        type: String,
        required: true
      },
      semester: {
        type: String,
        required: true
      },
      cleared: {
        type: Boolean,
        default: false
      },
      clearedDate: Date
    }],
    
    // Profile Content
    aboutMe: {
      type: String,
      required: function() { 
        return this.parent().role === 'student' && this.parent().isProfileBeingCompleted;
      },
      minlength: [50, 'About me should be at least 50 characters long'],
      maxlength: [500, 'About me should not exceed 500 characters']
    },
    skills: {
      type: [String],
      required: function() { 
        return this.parent().role === 'student' && this.parent().isProfileBeingCompleted;
      },
      validate: {
        validator: function(v) {
          if (this.parent().role !== 'student' || !this.parent().isProfileBeingCompleted) return true;
          return v && v.length > 0;
        },
        message: 'At least one skill is required'
      }
    },
    
    // Verification
    isProfileComplete: { type: Boolean, default: false },
    profileCompletionPercentage: { type: Number, default: 0 },
    // Placement status
    isPlaced: { type: Boolean, default: false },
    placementStatus: { 
      type: String, 
      enum: ['unplaced', 'shortlisted', 'placed'], 
      default: 'unplaced' 
    },
    currentOffer: {
      company: String,
      ctc: Number,
      offerDate: Date
    }
  }
}, {
  timestamps: true
});

// Password validation
userSchema.pre('save', function(next) {
  if (!this.isModified('password')) return next();
  
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  if (!passwordRegex.test(this.password)) {
    return next(new Error('Password must contain at least 8 characters with uppercase, lowercase, digit, and special character'));
  }
  
  this.password = bcrypt.hashSync(this.password, 12);
  next();
});

// Email validation for students
userSchema.pre('save', function(next) {
  if (this.role === 'student' && this.isNew) {
    const institutionalEmailRegex = /@gct\.ac\.in$/;
    if (!institutionalEmailRegex.test(this.email)) {
      return next(new Error('Students must use institutional email (@gct.ac.in)'));
    }
  }
  next();
});

// Calculate profile completion percentage
userSchema.methods.calculateProfileCompletion = function() {
  if (this.role !== 'student' && this.role !== 'placement_representative') {
    if (!this.profile) this.profile = {};
    this.profile.isProfileComplete = true;
    this.profile.profileCompletionPercentage = 100;
    return 100;
  }
  
  // Initialize profile if it doesn't exist
  if (!this.profile) {
    this.profile = {
      isProfileComplete: false,
      profileCompletionPercentage: 0
    };
    return 0;
  }
  
  const requiredFields = [
    'name', 'degree', 'department', 'graduationYear',
    'cgpa', 'address', 'phoneNumber', 'linkedinUrl',
    'photo', 'collegeIdCard', 'resume', 'aboutMe'
  ];
  
  const requiredArrays = [
    'marksheets', 'skills'
  ];
  
  // currentBacklogs is required but historyOfBacklogs is optional
  const requiredNumbers = ['currentBacklogs'];
  
  // GitHub required only for CSE/IT
  const isCSEIT = ['Computer Science', 'Information Technology'].includes(this.profile.department);
  if (isCSEIT) {
    requiredFields.push('githubUrl');
  }
  
  let completedFields = 0;
  const totalFields = requiredFields.length + requiredArrays.length + requiredNumbers.length;
  
  // Check required fields
  requiredFields.forEach(field => {
    const value = this.profile[field];
    if (value && value !== '' && value !== null && value !== undefined) {
      completedFields++;
    }
  });
  
  // Check required arrays
  requiredArrays.forEach(field => {
    const value = this.profile[field];
    if (Array.isArray(value) && value.length > 0) {
      completedFields++;
    }
  });
  
  // Check required numbers
  requiredNumbers.forEach(field => {
    const value = this.profile[field];
    if (value !== undefined && value !== null) {
      completedFields++;
    }
  });
  
  const percentage = Math.round((completedFields / totalFields) * 100);
  this.profile.profileCompletionPercentage = percentage;
  this.profile.isProfileComplete = percentage === 100;
  
  return percentage;
};

// Get missing profile fields
userSchema.methods.getMissingProfileFields = function() {
  if (this.role !== 'student') return [];
  
  const missing = [];
  const requiredFields = {
    'profile.name': 'Name',
    'profile.degree': 'Degree',
    'profile.department': 'Department',
    'profile.graduationYear': 'Graduation Year',
    'profile.cgpa': 'CGPA',
    'profile.address': 'Address',
    'profile.phoneNumber': 'Phone Number',
    'profile.linkedinUrl': 'LinkedIn URL',
    'profile.photo': 'Photo',
    'profile.collegeIdCard': 'College ID Card',
    'profile.resume': 'Resume',
    'profile.aboutMe': 'About Me'
  };
  
  const requiredArrays = {
    'profile.marksheets': 'Marksheets',
    'profile.skills': 'Skills'
  };
  
  // GitHub required only for CSE/IT
  const isCSEIT = ['Computer Science', 'Information Technology'].includes(this.profile?.department);
  if (isCSEIT) {
    requiredFields['profile.githubUrl'] = 'GitHub URL';
  }
  
  // Check required fields
  Object.entries(requiredFields).forEach(([field, label]) => {
    const value = field.split('.').reduce((obj, key) => obj?.[key], this);
    if (!value || value.toString().trim() === '') {
      missing.push(label);
    }
  });
  
  // Check required arrays
  Object.entries(requiredArrays).forEach(([field, label]) => {
    const value = field.split('.').reduce((obj, key) => obj?.[key], this);
    if (!value || !Array.isArray(value) || value.length === 0) {
      missing.push(label);
    }
  });
  
  // Check currentBacklogs
  if (typeof this.profile?.currentBacklogs !== 'number') {
    missing.push('Current Backlogs');
  }
  
  return missing;
};

module.exports = mongoose.model('User', userSchema);



























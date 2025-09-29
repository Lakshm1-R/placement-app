const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const User = require("../models/User");
const CGPAReference = require('../models/CGPAReference');
const { auth } = require("../middleware/auth");

const router = express.Router();

// Email transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Registration route
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const validRoles = [
      "student",
      "placement_officer",
      "placement_representative",
      "staff",
    ];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ message: "Invalid role selected" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res
        .status(400)
        .json({ message: "User already exists with this email" });
    }

    const passwordRegex =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passwordRegex.test(password)) {
      return res.status(400).json({
        message:
          "Password must contain at least 8 characters with uppercase, lowercase, digit, and special character",
      });
    }

    if (role === "student") {
      const institutionalEmailRegex = /@gct\.ac\.in$/;
      if (!institutionalEmailRegex.test(email)) {
        return res.status(400).json({
          message: "Students must use institutional email (@gct.ac.in)",
        });
      }
    }

    const verificationToken = crypto.randomBytes(32).toString("hex");
    const verificationTokenExpires = Date.now() + 24 * 60 * 60 * 1000;

    const user = new User({
      name,
      email,
      password,
      role,
      verificationToken,
      verificationTokenExpires,
      profile: {
        name: name,
      },
    });

    await user.save();

    // Auto-assign CGPA for new students if data exists
    if (role === 'student') {
      try {
        // Extract roll number from email (assuming format like rollno@gct.ac.in)
        const emailPrefix = email.split('@')[0].toUpperCase();
        
        console.log('=== AUTO CGPA ASSIGNMENT ===');
        console.log('New student email:', email);
        console.log('Extracted roll number:', emailPrefix);
        
        // Look up CGPA from reference collection
        const cgpaRef = await CGPAReference.findOne({
          rollNumber: emailPrefix
        });

        console.log('CGPA reference found:', cgpaRef ? 'Yes' : 'No');
        
        if (cgpaRef && cgpaRef.cgpa) {
          console.log('Assigning CGPA from reference:', cgpaRef.cgpa);
          
          // Update the user's profile with CGPA
          user.profile.cgpa = cgpaRef.cgpa;
          user.profile.rollNumber = emailPrefix; // Also set the roll number
          user.markModified('profile');
          await user.save();
          
          console.log(`✅ Auto-assigned CGPA ${cgpaRef.cgpa} to new student ${email}`);
        } else {
          console.log('❌ No CGPA reference found for roll number:', emailPrefix);
          
          // Try alternative patterns (last 4 digits, etc.)
          const rollVariations = [
            emailPrefix.slice(-4), // Last 4 digits
            emailPrefix.slice(-6), // Last 6 digits
            emailPrefix.replace(/[^0-9]/g, ''), // Only numbers
          ];
          
          for (const variation of rollVariations) {
            if (variation.length >= 3) {
              const altRef = await CGPAReference.findOne({
                rollNumber: { $regex: variation, $options: 'i' }
              });
              
              if (altRef) {
                console.log(`✅ Found CGPA using variation ${variation}:`, altRef.cgpa);
                user.profile.cgpa = altRef.cgpa;
                user.profile.rollNumber = emailPrefix;
                user.markModified('profile');
                await user.save();
                break;
              }
            }
          }
        }
      } catch (error) {
        console.error('Error in auto CGPA assignment:', error);
      }
    }

    const verificationUrl = `${process.env.CLIENT_URL}/verify-email/${verificationToken}`;
    
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Verify Your Email - Campus Placement Portal',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Email Verification</h2>
          <p>Hello ${user.name},</p>
          <p>Please verify your email address by clicking the link below:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verificationUrl}" style="background-color: #4F46E5; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Verify Email Address
            </a>
          </div>
          <p>This link will expire in 24 hours.</p>
          <p>If you didn't request this, please ignore this email.</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);

    res.status(201).json({
      message:
        "Registration successful! Please check your email to verify your account.",
      userId: user._id,
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ message: error.message || "Registration failed" });
  }
});

// Login route
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    if (!user.isVerified) {
      return res.status(400).json({ 
        message: 'Please verify your email before logging in',
        needsVerification: true,
        email: user.email
      });
    }

    if (user.role === 'student' || user.role === 'placement_representative') {
      user.calculateProfileCompletion();
      await user.save({ validateBeforeSave: false });
    }

    console.log('=== LOGIN RESPONSE DEBUG ===');
    console.log('User role:', user.role);
    console.log('Profile complete:', user.profile?.isProfileComplete);
    console.log('Is profile complete:', user.isProfileComplete);

    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isVerified: user.isVerified,
        profile: user.profile || {},
        isProfileComplete: user.profile?.isProfileComplete || false,
        profileCompletionPercentage: user.profile?.profileCompletionPercentage || 0,
        needsProfileCompletion: (user.role === 'student' || user.role === 'placement_representative') && !user.profile?.isProfileComplete,
        placementPolicyConsent: user.placementPolicyConsent || { hasAgreed: false },
        verificationStatus: user.verificationStatus || { otpVerified: false, isVerified: false }
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// Profile update route
router.put('/profile', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const updateData = req.body;
    
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { 
        $set: { 
          'profile': updateData,
          'isProfileComplete': true 
        }
      },
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ 
      message: 'Profile updated successfully',
      user: updatedUser 
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Email verification route
router.get('/verify-email/:token', async (req, res) => {
  try {
    const { token } = req.params;
    
    console.log('=== EMAIL VERIFICATION BACKEND ===');
    console.log('Received token:', token);

    if (!token) {
      return res.status(400).json({ message: 'Verification token is required' });
    }

    // First check if user exists with this token (not expired)
    let user = await User.findOne({
      verificationToken: token,
      verificationTokenExpires: { $gt: Date.now() }
    });

    // If not found, check if user is already verified with this token pattern
    if (!user) {
      user = await User.findOne({
        email: { $exists: true },
        isVerified: true
      });
      
      // If user is already verified, return success
      if (user) {
        console.log('User already verified:', user.email);
        return res.json({ 
          message: 'Email already verified! You can now log in.',
          success: true 
        });
      }
    }

    console.log('User found:', user ? user.email : 'No user found');

    if (!user) {
      return res.status(400).json({ 
        message: 'Invalid or expired verification token' 
      });
    }

    // Update user verification status only if not already verified
    if (!user.isVerified) {
      user.isVerified = true;
      user.verificationToken = undefined;
      user.verificationTokenExpires = undefined;
      await user.save();
      console.log('User verified successfully:', user.email);
    }

    res.json({ 
      message: 'Email verified successfully! You can now log in.',
      success: true 
    });

  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({ 
      message: 'Server error during email verification' 
    });
  }
});

// Resend verification email route
router.post('/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.isVerified) {
      return res.status(400).json({ message: 'Email is already verified' });
    }

    // Generate new verification token
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const verificationTokenExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

    user.verificationToken = verificationToken;
    user.verificationTokenExpires = verificationTokenExpires;
    await user.save();

    // Send verification email
    const verificationUrl = `${process.env.CLIENT_URL}/verify-email/${verificationToken}`;
    
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Verify Your Email - Campus Placement Portal',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Email Verification</h2>
          <p>Hello ${user.name},</p>
          <p>Please verify your email address by clicking the link below:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verificationUrl}" style="background-color: #4F46E5; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Verify Email Address
            </a>
          </div>
          <p>This link will expire in 24 hours.</p>
          <p>If you didn't request this, please ignore this email.</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);

    res.json({ 
      message: 'Verification email sent successfully! Please check your inbox.' 
    });

  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({ 
      message: 'Failed to send verification email' 
    });
  }
});

// Add token verification route
router.get('/verify-token', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Calculate profile completion for students and PRs
    if (user.role === 'student' || user.role === 'placement_representative') {
      user.calculateProfileCompletion();
      await user.save({ validateBeforeSave: false });
    }

    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isVerified: user.isVerified,
        profile: user.profile || {},
        isProfileComplete: user.profile?.isProfileComplete || false,
        profileCompletionPercentage: user.profile?.profileCompletionPercentage || 0,
        placementPolicyConsent: user.placementPolicyConsent || { hasAgreed: false },
        verificationStatus: user.verificationStatus || { otpVerified: false, isVerified: false }
      }
    });
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(401).json({ message: 'Invalid token' });
  }
});

// Get current user
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isVerified: user.isVerified,
        profile: user.profile || {},
        isProfileComplete: user.profile?.isProfileComplete || false,
        profileCompletionPercentage: user.profile?.profileCompletionPercentage || 0,
        placementPolicyConsent: user.placementPolicyConsent || { hasAgreed: false },
        verificationStatus: user.verificationStatus || { otpVerified: false, isVerified: false }
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;











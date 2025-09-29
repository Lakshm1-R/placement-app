const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth").auth;
const User = require("../models/User");
const multer = require("multer");
const path = require("path");
const { emitProfileUpdate } = require("../utils/socketUtils");

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(__dirname, "../uploads");
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(
      null,
      file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname)
    );
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: function (req, file, cb) {
    // Allow specific file types
    const allowedTypes = {
      photo: /jpeg|jpg|png/,
      resume: /pdf/,
      collegeIdCard: /jpeg|jpg|png|pdf/,
      marksheets: /jpeg|jpg|png|pdf/,
    };

    const extname = allowedTypes[file.fieldname]?.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimetype = allowedTypes[file.fieldname]?.test(file.mimetype);

    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error(`Invalid file type for ${file.fieldname}`));
    }
  },
});

// Get user profile
router.get("/", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      id: user._id,
      email: user.email,
      role: user.role,
      profile: user.profile || {},
      isProfileComplete: user.isProfileComplete,
    });
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Get profile completion status
router.get("/completion-status", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Calculate current completion status
    user.calculateProfileCompletion();
    await user.save();

    res.json({
      percentage: user.profile.profileCompletionPercentage || 0,
      isComplete: user.profile.isProfileComplete || false,
      missingFields: user.getMissingProfileFields
        ? user.getMissingProfileFields()
        : [],
    });
  } catch (error) {
    console.error("Get completion status error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Update basic info
router.put("/basic-info", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Initialize profile if it doesn't exist
    if (!user.profile) {
      user.profile = {};
    }

    // Allow CGPA updates only during initial profile completion or if profile is not complete
    // Block CGPA updates for students and PRs only if profile is already complete
    if (
      (user.role === "student" || user.role === "placement_representative") &&
      req.body.cgpa !== undefined &&
      user.profile.isProfileComplete
    ) {
      delete req.body.cgpa;
      console.log(
        "CGPA update blocked for completed profile, role:",
        user.role
      );
    }

    // List of allowed fields to update
    const allowedFields = [
      "name",
      "rollNumber",
      "degree",
      "department",
      "graduationYear",
      "cgpa",
      "address",
      "phoneNumber",
      "linkedinUrl",
      "githubUrl",
      "currentBacklogs",
      "historyOfBacklogs",
      "aboutMe",
      "skills",
      // New fields
      "gender",
      "dateOfBirth",
      "personalEmail",
      "collegeEmail",
      "tenthPercentage",
      "twelfthPercentage",
      "diplomaPercentage",
    ];

    // Update profile fields directly from request body
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        user.profile[field] = req.body[field];
      }
    });

    // Mark profile as modified to ensure it saves
    user.markModified("profile");

    // Calculate profile completion for students and PRs
    if (user.role === "student" || user.role === "placement_representative") {
      user.calculateProfileCompletion();
    }

    await user.save();

    console.log("Profile updated:", user.profile);

    // Emit socket event for real-time updates
    const io = req.app.get("io");
    if (io) {
      emitProfileUpdate(io, "basic_info_updated", {
        userId: user._id,
        email: user.email,
        profile: user.profile,
      });
    }

    res.json({
      message: "Profile updated successfully",
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        profile: user.profile,
      },
    });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Upload files endpoint
router.post(
  "/upload-files",
  auth,
  upload.fields([
    { name: "photo", maxCount: 1 },
    { name: "resume", maxCount: 1 },
    { name: "collegeIdCard", maxCount: 1 },
    { name: "marksheets", maxCount: 10 },
  ]),
  async (req, res) => {
    try {
      const user = await User.findById(req.user.id);

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Initialize profile if it doesn't exist
      if (!user.profile) {
        user.profile = {};
      }

      // Process uploaded files
      if (req.files) {
        if (req.files.photo) {
          user.profile.photo = req.files.photo[0].filename;
        }

        if (req.files.resume) {
          user.profile.resume = req.files.resume[0].filename;
        }

        if (req.files.collegeIdCard) {
          user.profile.collegeIdCard = req.files.collegeIdCard[0].filename;
        }

        if (req.files.marksheets) {
          user.profile.marksheets = req.files.marksheets.map(
            (file) => file.filename
          );
        }
      }

      // Calculate profile completion for students
      if (user.role === "student") {
        user.calculateProfileCompletion();
      }

      // Save without validation for file uploads
      await user.save({ validateBeforeSave: false });

      // Emit socket event for real-time updates
      const io = req.app.get("io");
      if (io) {
        emitProfileUpdate(io, "files_uploaded", {
          userId: user._id,
          email: user.email,
          uploadedFiles: Object.keys(req.files || {}),
        });
      }

      res.json({
        message: "Files uploaded successfully",
        user: {
          id: user._id,
          email: user.email,
          role: user.role,
          profile: user.profile,
        },
      });
    } catch (error) {
      console.error("File upload error:", error);

      if (error instanceof multer.MulterError) {
        return res.status(400).json({
          message: `File upload error: ${error.message}`,
        });
      }

      res.status(500).json({ message: "Server error during file upload" });
    }
  }
);

module.exports = router;

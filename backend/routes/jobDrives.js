const express = require("express");
const router = express.Router();
const JobDrive = require("../models/JobDrive");
const User = require("../models/User");
const { auth } = require("../middleware/auth");
const { requirePlacementConsent } = require("../middleware/placementConsent");
const { requireCompleteProfile } = require("../middleware/profileComplete");
const { emitJobDriveUpdate } = require("../utils/socketUtils");

// Helper function to normalize department names
const normalizeDepartment = (dept) => {
  if (!dept) return null;
  return dept.toLowerCase().trim();
};

// Authorization middleware for PO and PR
const authorizePO = (req, res, next) => {
  const allowedRoles = [
    "po",
    "placementofficer",
    "placement_officer",
    "placement_representative",
  ];
  if (!allowedRoles.includes(req.user.role)) {
    return res
      .status(403)
      .json({
        message:
          "Access denied - Only Placement Officers and Representatives can perform this action",
      });
  }
  next();
};

// Authorization middleware for same department PRs only
const authorizeSameDepartmentPR = async (req, res, next) => {
  try {
    if (
      req.user.role !== "placement_representative" &&
      req.user.role !== "pr"
    ) {
      return res
        .status(403)
        .json({ message: "Access denied - Only PRs can perform this action" });
    }

    // Get the job drive with creator's department
    const jobDrive = await JobDrive.findById(req.params.id).populate(
      "createdBy",
      "profile.department"
    );
    if (!jobDrive) {
      return res.status(404).json({ message: "Job drive not found" });
    }

    // Get current user's department
    const currentUser = await User.findById(req.user.id);
    const currentUserDept = normalizeDepartment(
      currentUser.profile?.department
    );
    const driveCreatorDept = normalizeDepartment(
      jobDrive.createdBy?.profile?.department
    );

    console.log("=== NORMALIZED DEPARTMENT CHECK ===");
    console.log("Current User Dept (normalized):", currentUserDept);
    console.log("Drive Creator Dept (normalized):", driveCreatorDept);

    // Allow if same department or if user created the drive
    if (
      jobDrive.createdBy._id.toString() === req.user.id ||
      (currentUserDept &&
        driveCreatorDept &&
        currentUserDept === driveCreatorDept)
    ) {
      req.jobDrive = jobDrive;
      return next();
    }

    return res.status(403).json({
      message:
        "Access denied - Only PRs from the same department can manage this drive",
      userDepartment: currentUser.profile?.department,
      driveDepartment: jobDrive.createdBy?.profile?.department,
    });
  } catch (error) {
    console.error("Department authorization error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// View-only access for students and POs, department-based access for PRs
const authorizeViewOnly = async (req, res, next) => {
  try {
    const jobDrive = await JobDrive.findById(req.params.id)
      .populate("createdBy", "profile.department")
      .populate("applications.student", "email profile")
      .populate("selectionRounds.selectedStudents", "email profile");

    if (!jobDrive) {
      return res.status(404).json({ message: "Job drive not found" });
    }

    // Students and POs get view-only access
    if (
      req.user.role === "student" ||
      req.user.role === "po" ||
      req.user.role === "placement_officer"
    ) {
      req.jobDrive = jobDrive;
      req.viewOnly = true;
      return next();
    }

    // For PRs - check department access
    if (
      req.user.role === "placement_representative" ||
      req.user.role === "pr"
    ) {
      const currentUser = await User.findById(req.user.id);
      const currentUserDept = normalizeDepartment(
        currentUser.profile?.department
      );
      const driveCreatorDept = normalizeDepartment(
        jobDrive.createdBy?.profile?.department
      );

      console.log("=== VIEW ACCESS CHECK ===");
      console.log("Current User:", req.user.email);
      console.log("Current User Dept (normalized):", currentUserDept);
      console.log("Drive Creator Dept (normalized):", driveCreatorDept);
      console.log("Drive Creator:", jobDrive.createdBy.email);

      req.jobDrive = jobDrive;

      // Same department or drive creator gets full access
      if (
        jobDrive.createdBy._id.toString() === req.user.id ||
        (currentUserDept &&
          driveCreatorDept &&
          currentUserDept === driveCreatorDept)
      ) {
        req.viewOnly = false;
        console.log("✅ Full access granted - same department");
        return next();
      } else {
        // Other department PRs get view-only access
        req.viewOnly = true;
        console.log("👁️ View-only access granted - different department");
        return next();
      }
    }

    return res.status(403).json({ message: "Access denied" });
  } catch (error) {
    console.error("View authorization error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// Create new job drive - Only for authorized PO and PR
router.post("/", auth, authorizePO, async (req, res) => {
  try {
    console.log("=== CREATE JOB DRIVE ===");
    console.log("User role:", req.user.role);
    console.log("User ID:", req.user.id);

    const jobDriveData = {
      // Basic Company Details
      companyName: req.body.companyName,
      companyWebsite: req.body.companyWebsite || "",
      companyDescription: req.body.companyDescription || "",
      recruiterContact: {
        name: req.body.recruiterContact?.name || "",
        email: req.body.recruiterContact?.email || "",
        phone: req.body.recruiterContact?.phone || "",
      },
      driveMode: req.body.driveMode || "on-campus",
      locations:
        req.body.locations || (req.body.location ? [req.body.location] : []),
      location: req.body.location || "",

      // Job Role Details
      role: req.body.role,
      type: req.body.type || "full-time",
      jobType: req.body.type || "full-time",
      description: req.body.description,
      requirements: req.body.requirements || "",
      skills: req.body.skills || [],

      // Package Details
      ctc: req.body.ctc,
      ctcBreakdown: {
        baseSalary: req.body.ctcBreakdown?.baseSalary || 0,
        variablePay: req.body.ctcBreakdown?.variablePay || 0,
        joiningBonus: req.body.ctcBreakdown?.joiningBonus || 0,
        otherBenefits: req.body.ctcBreakdown?.otherBenefits || "",
      },

      // Bond Details
      bond: req.body.bond || "",
      bondDetails: {
        amount: req.body.bondDetails?.amount || 0,
        duration: req.body.bondDetails?.duration || "",
      },

      // Drive Details
      date: req.body.date,
      time: req.body.time,
      deadline: req.body.deadline,
      venue: req.body.venue,

      // Selection Process
      selectionRounds: req.body.selectionRounds || [],
      rounds: req.body.rounds || [],

      // Additional Settings
      isDreamJob: req.body.isDreamJob || false,
      unplacedOnly: req.body.unplacedOnly || false,

      // Eligibility
      eligibility: {
        minCGPA:
          req.body.eligibility?.minCGPA || req.body.eligibility?.cgpa || 0,
        cgpa: req.body.eligibility?.cgpa || req.body.eligibility?.minCGPA || 0,
        maxBacklogs: req.body.eligibility?.maxBacklogs || 0,
        allowedDepartments:
          req.body.eligibility?.allowedDepartments ||
          req.body.eligibility?.departments ||
          [],
        departments:
          req.body.eligibility?.departments ||
          req.body.eligibility?.allowedDepartments ||
          [],
        allowedBatches:
          req.body.eligibility?.allowedBatches ||
          req.body.eligibility?.batches ||
          [],
        batches:
          req.body.eligibility?.batches ||
          req.body.eligibility?.allowedBatches ||
          [],
        noCurrentBacklogs: req.body.eligibility?.noCurrentBacklogs || false,
        historyOfArrears: req.body.eligibility?.historyOfArrears || false,
      },

      // System fields
      isActive: true,
      createdBy: req.user.id,
      applications: [],
      placedStudents: [],
    };

    console.log("Saving job drive data:", jobDriveData); // Debug log

    const jobDrive = new JobDrive(jobDriveData);
    await jobDrive.save();

    console.log("Job drive created successfully:", jobDrive);

    // Emit socket event for new job drive
    const io = req.app.get("io");
    emitJobDriveUpdate(io, "created", jobDrive);

    res.status(201).json({
      message: "Job drive created successfully",
      jobDrive,
    });
  } catch (error) {
    console.error("Create job drive error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Get all job drives (for placement representatives to see everything)
router.get("/", auth, async (req, res) => {
  try {
    console.log("Fetching all job drives for user:", req.user.role);

    let query = {};

    // If it's a student, only show active drives
    if (req.user.role === "student") {
      query.isActive = true;
    }

    const jobDrives = await JobDrive.find(query)
      .populate("createdBy", "email profile")
      .populate("applications.student", "email profile")
      .sort({ createdAt: -1 });

    // Process drives for display
    const processedDrives = jobDrives.map((drive) => ({
      ...drive.toObject(),
      type: drive.type || drive.jobType || "full-time",
      jobType: drive.jobType || drive.type || "full-time",
      displayType:
        drive.type === "full-time"
          ? "Full Time"
          : drive.type === "internship"
          ? "Internship"
          : "Full Time",
      displayLocation:
        drive.location ||
        (drive.locations && drive.locations.length > 0
          ? drive.locations.join(", ")
          : "Not specified"),
    }));

    console.log(`Found ${processedDrives.length} job drives`);

    res.json({
      jobDrives: processedDrives,
      count: processedDrives.length,
    });
  } catch (error) {
    console.error("Error fetching job drives:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Get eligible drives for students
router.get("/student-drives", auth, async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res.status(403).json({ message: "Access denied - Students only" });
    }

    const user = await User.findById(req.user.id);
    if (!user || !user.profile) {
      return res.status(400).json({ message: "User profile not found" });
    }

    console.log("=== STUDENT DRIVES REQUEST ===");
    console.log("Student:", user.email);
    console.log("Profile:", user.profile);

    const userProfile = user.profile;
    const userCGPA = parseFloat(userProfile.cgpa) || 0;
    const userBacklogs =
      parseInt(userProfile.currentBacklogs || userProfile.backlogs) || 0;
    const userDepartment = userProfile.department;
    const userBatch =
      userProfile.batch ||
      (userProfile.graduationYear
        ? userProfile.graduationYear.toString()
        : null);
    const isUserPlaced =
      userProfile.isPlaced || userProfile.placementStatus === "placed";

    console.log("User criteria:", {
      cgpa: userCGPA,
      backlogs: userBacklogs,
      department: userDepartment,
      batch: userBatch,
      isPlaced: isUserPlaced,
    });

    const currentDate = new Date();

    // Get all active drives
    const allDrives = await JobDrive.find({
      isActive: true,
      date: { $gte: currentDate },
    }).populate("createdBy", "email profile");

    console.log(`Found ${allDrives.length} active drives`);

    // Filter drives based on eligibility
    const eligibleDrives = allDrives.filter((drive) => {
      // Check CGPA eligibility
      if (drive.eligibility?.minCGPA && userCGPA < drive.eligibility.minCGPA) {
        return false;
      }

      // Check department eligibility
      if (
        drive.eligibility?.allowedDepartments &&
        drive.eligibility.allowedDepartments.length > 0 &&
        !drive.eligibility.allowedDepartments.includes(userDepartment)
      ) {
        return false;
      }

      // Check backlogs eligibility
      if (
        drive.eligibility?.maxBacklogs !== undefined &&
        userBacklogs > drive.eligibility.maxBacklogs
      ) {
        return false;
      }

      // Check batch eligibility
      if (
        drive.eligibility?.allowedBatches &&
        drive.eligibility.allowedBatches.length > 0 &&
        userBatch &&
        !drive.eligibility.allowedBatches.includes(userBatch)
      ) {
        return false;
      }

      // Check placement status eligibility
      const driveCTC = parseFloat(drive.ctc) || 0;
      if (isUserPlaced && driveCTC <= 10) {
        return false;
      }

      return true;
    });

    // Process drives for display
    const processedDrives = eligibleDrives.map((drive) => ({
      ...drive.toObject(),
      type: drive.type || drive.jobType || "full-time",
      jobType: drive.jobType || drive.type || "full-time",
      displayType:
        drive.type === "full-time"
          ? "Full Time"
          : drive.type === "internship"
          ? "Internship"
          : "Full Time",
      displayLocation:
        drive.location ||
        (drive.locations && drive.locations.length > 0
          ? drive.locations.join(", ")
          : "Not specified"),
      hasApplied: drive.applications?.some(
        (app) => app.student?.toString() === req.user.id
      ),
    }));

    console.log(
      `User ${user.email} - Total drives: ${allDrives.length}, Eligible: ${processedDrives.length}`
    );

    res.json({
      drives: processedDrives,
      count: processedDrives.length,
    });
  } catch (error) {
    console.error("Error fetching student drives:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Get all drives (for stats and general viewing)
router.get("/all", auth, async (req, res) => {
  try {
    const jobDrives = await JobDrive.find({ isActive: true })
      .populate("createdBy", "email profile")
      .populate("applications.student", "email profile")
      .sort({ createdAt: -1 });

    // Process drives to ensure all fields are properly set
    const processedDrives = jobDrives.map((drive) => ({
      ...drive.toObject(),
      type: drive.type || drive.jobType || "full-time",
      jobType: drive.jobType || drive.type || "full-time",
      location:
        drive.location ||
        (drive.locations && drive.locations.length > 0
          ? drive.locations.join(", ")
          : "Not specified"),
    }));

    res.json({
      jobDrives: processedDrives,
      count: processedDrives.length,
    });
  } catch (error) {
    console.error("Error fetching all job drives:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Get stats for dashboard
router.get("/stats", auth, async (req, res) => {
  try {
    // Get total drives count for everyone
    const allDrives = await JobDrive.countDocuments();

    if (req.user.role === "student") {
      // For students - show their eligible drives and applications
      const user = await User.findById(req.user.id);
      const currentDate = new Date();

      // Get eligible drives count
      const userCGPA = parseFloat(user.profile?.cgpa) || 0;
      const userBacklogs = parseInt(user.profile?.currentBacklogs) || 0;
      const userDepartment = user.profile?.department;

      // Fix: Use graduationYear as batch if batch is not available
      const userBatch =
        user.profile?.batch ||
        (user.profile?.graduationYear
          ? user.profile.graduationYear.toString()
          : null);

      const eligibleDrives = await JobDrive.find({
        isActive: true,
        date: { $gte: currentDate },
        $and: [
          {
            $or: [
              { "eligibility.minCGPA": { $lte: userCGPA + 0.01 } },
              { "eligibility.minCGPA": { $exists: false } },
              { "eligibility.minCGPA": 0 },
            ],
          },
          {
            $or: [
              { "eligibility.allowedDepartments": { $size: 0 } },
              { "eligibility.allowedDepartments": { $exists: false } },
              { "eligibility.allowedDepartments": { $in: [userDepartment] } },
            ],
          },
          {
            $or: [
              { "eligibility.maxBacklogs": { $gte: userBacklogs } },
              { "eligibility.maxBacklogs": { $exists: false } },
            ],
          },
          // Add batch check here too
          {
            $or: [
              { "eligibility.allowedBatches": { $size: 0 } },
              { "eligibility.allowedBatches": { $exists: false } },
              { "eligibility.allowedBatches": { $in: [userBatch] } },
            ],
          },
        ],
      });

      // Count applications by this student
      const appliedDrives = await JobDrive.countDocuments({
        "applications.student": req.user.id,
      });

      res.json({
        totalDrives: eligibleDrives.length, // Eligible drives for student
        appliedDrives: appliedDrives, // Student's applications
        availableDrives: eligibleDrives.length - appliedDrives, // Available to apply
        allDrives: allDrives, // Total drives in system
      });
    } else {
      // For PO/admin - show all drives data
      const upcomingDrives = await JobDrive.countDocuments({
        date: { $gte: new Date() },
        isActive: true,
      });

      const drives = await JobDrive.find();
      const totalApplications = drives.reduce(
        (sum, drive) => sum + drive.applications.length,
        0
      );

      res.json({
        totalDrives: upcomingDrives, // Active upcoming drives
        upcomingDrives: upcomingDrives, // Same as above
        applicationsReceived: totalApplications, // Total applications
        allDrives: allDrives, // Total drives in system
      });
    }
  } catch (error) {
    console.error("Stats error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Apply to drive
router.post(
  "/:id/apply",
  auth,
  requireCompleteProfile,
  requirePlacementConsent,
  async (req, res) => {
    try {
      console.log("=== APPLY TO JOB DRIVE ===");
      console.log("Drive ID:", req.params.id);
      console.log("User:", req.user.email, "Role:", req.user.role);

      // Allow both students and placement representatives to apply
      if (
        req.user.role !== "student" &&
        req.user.role !== "placement_representative"
      ) {
        return res
          .status(403)
          .json({ message: "Access denied - Students and PRs only" });
      }

      const jobDrive = await JobDrive.findById(req.params.id);
      if (!jobDrive) {
        return res.status(404).json({ message: "Job drive not found" });
      }

      if (!jobDrive.isActive) {
        return res.status(400).json({ message: "Job drive is not active" });
      }

      // Check if application deadline has passed (use deadline if available, otherwise drive date)
      const checkDate = jobDrive.deadline || jobDrive.date;

      if (!checkDate) {
        return res
          .status(400)
          .json({ message: "No deadline or drive date set" });
      }

      const deadlineDate = new Date(checkDate);
      const currentDate = new Date();

      // Validate the deadline date
      if (isNaN(deadlineDate.getTime())) {
        console.error("Invalid deadline date:", checkDate);
        return res
          .status(400)
          .json({ message: "Invalid deadline date format" });
      }

      // If there's a specific time and we're checking deadline, apply the time
      if (jobDrive.time && jobDrive.deadline) {
        try {
          const [hours, minutes] = jobDrive.time.split(":");
          deadlineDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
        } catch (timeError) {
          console.error("Error parsing time:", jobDrive.time, timeError);
        }
      } else {
        // If no specific time, allow applications until end of deadline day
        deadlineDate.setHours(23, 59, 59, 999);
      }

      console.log("=== DEADLINE CHECK ===");
      console.log("Raw checkDate:", checkDate);
      console.log("Parsed deadlineDate:", deadlineDate.toISOString());
      console.log("Current date:", currentDate.toISOString());
      console.log("Drive time:", jobDrive.time);
      console.log("Has deadline:", !!jobDrive.deadline);
      console.log("Deadline passed:", deadlineDate < currentDate);
      console.log(
        "Time difference (hours):",
        (deadlineDate - currentDate) / (1000 * 60 * 60)
      );

      if (deadlineDate < currentDate) {
        return res.status(400).json({
          message: "Application deadline has passed",
          deadline: deadlineDate.toISOString(),
          current: currentDate.toISOString(),
        });
      }

      // Check if already applied
      const alreadyApplied = jobDrive.applications.some(
        (app) => app.student.toString() === req.user.id
      );

      if (alreadyApplied) {
        return res
          .status(400)
          .json({ message: "Already applied to this job drive" });
      }

      // Add application
      const newApplication = {
        student: req.user.id,
        appliedAt: new Date(),
        status: "applied",
      };

      jobDrive.applications.push(newApplication);
      await jobDrive.save();

      console.log("Application submitted successfully");

      // Emit socket event for new application
      const io = req.app.get("io");
      emitJobDriveUpdate(io, "application_submitted", {
        ...jobDrive.toObject(),
        applicationCount: jobDrive.applications.length,
        newApplication: {
          student: req.user.id,
          appliedAt: newApplication.appliedAt,
        },
      });

      res.json({
        message: "Application submitted successfully",
        application: newApplication,
      });
    } catch (error) {
      console.error("Apply error:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// Delete job drive
router.delete("/:id", auth, authorizePO, async (req, res) => {
  try {
    console.log("=== DELETE JOB DRIVE ===");
    console.log("Drive ID:", req.params.id);
    console.log("User:", req.user.email, "Role:", req.user.role);

    const jobDrive = await JobDrive.findByIdAndDelete(req.params.id);

    if (!jobDrive) {
      return res.status(404).json({ message: "Job drive not found" });
    }

    console.log("Job drive deleted successfully");

    // Emit socket event for job drive deletion
    const io = req.app.get("io");
    emitJobDriveUpdate(io, "deleted", jobDrive);

    res.json({ message: "Job drive deleted successfully" });
  } catch (error) {
    console.error("Delete job drive error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Debug route to check job drives in database
router.get("/debug/all", async (req, res) => {
  try {
    const jobDrives = await JobDrive.find();
    console.log("=== DEBUG: ALL JOB DRIVES ===");
    console.log(`Total drives in database: ${jobDrives.length}`);

    jobDrives.forEach((drive, index) => {
      console.log(`Drive ${index + 1}:`, {
        id: drive._id,
        company: drive.companyName,
        role: drive.role,
        isActive: drive.isActive,
        applications: drive.applications.length,
      });
    });

    res.json({
      total: jobDrives.length,
      drives: jobDrives.map((drive) => ({
        id: drive._id,
        companyName: drive.companyName,
        role: drive.role,
        isActive: drive.isActive,
        applicationsCount: drive.applications.length,
        createdAt: drive.createdAt,
      })),
    });
  } catch (error) {
    console.error("Debug error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Test endpoint to check all drives
router.get("/test-all", async (req, res) => {
  try {
    const allDrives = await JobDrive.find();
    const activeDrives = await JobDrive.find({ isActive: true });
    const futureDrives = await JobDrive.find({
      isActive: true,
      date: { $gte: new Date() },
    });

    console.log("=== DRIVE TEST ===");
    console.log("Total drives:", allDrives.length);
    console.log("Active drives:", activeDrives.length);
    console.log("Future active drives:", futureDrives.length);

    res.json({
      total: allDrives.length,
      active: activeDrives.length,
      futureActive: futureDrives.length,
      drives: allDrives.map((drive) => ({
        id: drive._id,
        company: drive.companyName,
        role: drive.role,
        date: drive.date,
        isActive: drive.isActive,
        createdAt: drive.createdAt,
      })),
    });
  } catch (error) {
    console.error("Test error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Debug endpoint to check eligibility criteria
router.get("/debug/eligibility", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const allDrives = await JobDrive.find();

    const debugInfo = {
      user: {
        cgpa: user.profile?.cgpa,
        department: user.profile?.department,
        currentBacklogs: user.profile?.currentBacklogs,
      },
      drives: allDrives.map((drive) => ({
        id: drive._id,
        company: drive.companyName,
        role: drive.role,
        isActive: drive.isActive,
        date: drive.date,
        eligibility: drive.eligibility,
        meetsMinCGPA:
          !drive.eligibility?.minCGPA ||
          drive.eligibility.minCGPA <= (user.profile?.cgpa || 0),
        meetsDepartment:
          !drive.eligibility?.allowedDepartments?.length ||
          drive.eligibility.allowedDepartments.includes(
            user.profile?.department
          ),
        meetsBacklogs:
          !drive.eligibility?.maxBacklogs ||
          drive.eligibility.maxBacklogs >= (user.profile?.currentBacklogs || 0),
        isFuture: new Date(drive.date) >= new Date(),
      })),
    };

    res.json(debugInfo);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get PR jobs
router.get("/pr-jobs", auth, async (req, res) => {
  try {
    if (
      req.user.role !== "pr" &&
      req.user.role !== "placement_representative"
    ) {
      return res
        .status(403)
        .json({ message: "Access denied - Only PRs can access this" });
    }

    const jobs = await JobDrive.find({ createdBy: req.user.id })
      .populate("createdBy", "email profile")
      .sort({ createdAt: -1 });

    // Ensure all fields are properly set
    const processedJobs = jobs.map((job) => ({
      ...job.toObject(),
      type: job.type || job.jobType || "full-time",
      jobType: job.jobType || job.type || "full-time",
      location:
        job.location ||
        (job.locations && job.locations.length > 0
          ? job.locations.join(", ")
          : "Not specified"),
    }));

    res.json({ jobs: processedJobs });
  } catch (error) {
    console.error("Error fetching PR jobs:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Get PR stats
router.get("/pr-stats", auth, async (req, res) => {
  try {
    if (
      req.user.role !== "pr" &&
      req.user.role !== "placement representative"
    ) {
      return res
        .status(403)
        .json({ message: "Access denied - Only PRs can access this" });
    }

    const totalJobs = await JobDrive.countDocuments({ createdBy: req.user.id });
    const activeJobs = await JobDrive.countDocuments({
      createdBy: req.user.id,
      isActive: true,
      approvalStatus: "approved",
    });
    const pendingJobs = await JobDrive.countDocuments({
      createdBy: req.user.id,
      approvalStatus: "pending",
    });

    // Get total applications for PR's jobs
    const prJobs = await JobDrive.find({ createdBy: req.user.id }).select(
      "_id"
    );
    const jobIds = prJobs.map((job) => job._id);

    const totalApplications = await User.countDocuments({
      "applications.jobDrive": { $in: jobIds },
    });

    res.json({
      totalJobs,
      activeJobs,
      pendingApplications: pendingJobs,
      totalApplications,
    });
  } catch (error) {
    console.error("Error fetching PR stats:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Get PR applications
router.get("/pr-applications", auth, async (req, res) => {
  try {
    if (
      req.user.role !== "pr" &&
      req.user.role !== "placement representative"
    ) {
      return res
        .status(403)
        .json({ message: "Access denied - Only PRs can access this" });
    }

    const prJobs = await JobDrive.find({ createdBy: req.user.id }).select(
      "_id"
    );
    const jobIds = prJobs.map((job) => job._id);

    const applications = await User.aggregate([
      { $unwind: "$applications" },
      { $match: { "applications.jobDrive": { $in: jobIds } } },
      {
        $lookup: {
          from: "jobdrives",
          localField: "applications.jobDrive",
          foreignField: "_id",
          as: "jobDrive",
        },
      },
      { $unwind: "$jobDrive" },
      {
        $project: {
          _id: "$applications._id",
          student: {
            _id: "$_id",
            email: "$email",
            profile: "$profile",
          },
          jobDrive: "$jobDrive",
          status: "$applications.status",
          appliedAt: "$applications.appliedAt",
        },
      },
      { $sort: { appliedAt: -1 } },
    ]);

    res.json({ applications });
  } catch (error) {
    console.error("Error fetching PR applications:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Get department applications count
router.get("/department-applications/:department", auth, async (req, res) => {
  try {
    const { department } = req.params;

    // Count all applications from users of this department
    const count = await User.countDocuments({
      "profile.department": department,
      applications: { $exists: true, $not: { $size: 0 } },
    });

    res.json({ count });
  } catch (error) {
    console.error("Error fetching department applications:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Get single job drive with proper access control
router.get("/:id", auth, authorizeViewOnly, async (req, res) => {
  try {
    const jobDrive = req.jobDrive;
    const viewOnly = req.viewOnly;

    console.log("=== DRIVE ACCESS RESPONSE ===");
    console.log("User:", req.user.email);
    console.log("Role:", req.user.role);
    console.log("View Only:", viewOnly);

    // For view-only access (students, POs, and other department PRs)
    if (viewOnly) {
      if (
        req.user.role === "student" ||
        req.user.role === "po" ||
        req.user.role === "placement_officer"
      ) {
        // Students and POs can see basic drive info and selected students
        return res.json({
          jobDrive: {
            ...jobDrive.toObject(),
            applications: [], // Hide applications from students/POs
            canManage: false,
            viewOnly: true,
          },
        });
      }

      if (
        req.user.role === "placement_representative" ||
        req.user.role === "pr"
      ) {
        // Other department PRs get very limited view
        return res.json({
          jobDrive: {
            _id: jobDrive._id,
            companyName: jobDrive.companyName,
            role: jobDrive.role,
            jobType: jobDrive.jobType,
            location: jobDrive.location,
            salary: jobDrive.salary,
            date: jobDrive.date,
            time: jobDrive.time,
            venue: jobDrive.venue,
            eligibility: jobDrive.eligibility,
            description: jobDrive.description,
            isActive: jobDrive.isActive,
            createdBy: jobDrive.createdBy,
            // Hide sensitive management data
            applications: [],
            selectionRounds: jobDrive.selectionRounds || [],
            placedStudents: jobDrive.placedStudents || [],
            canManage: false,
            viewOnly: true,
          },
        });
      }
    }

    // Full access for same department PRs
    console.log("✅ Full access granted");
    return res.json({
      jobDrive,
      canManage: true,
      viewOnly: false,
    });
  } catch (error) {
    console.error("Error fetching job drive:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Update job drive - Department restricted for PRs
router.put("/:id", auth, async (req, res) => {
  try {
    console.log("=== UPDATE JOB DRIVE ===");
    console.log("User:", req.user.email, "Role:", req.user.role);

    // POs can edit any drive
    if (req.user.role === "po" || req.user.role === "placement_officer") {
      const jobDrive = await JobDrive.findById(req.params.id);
      if (!jobDrive) {
        return res.status(404).json({ message: "Job drive not found" });
      }

      // PRESERVE SELECTED STUDENTS DATA when updating selection rounds
      if (req.body.selectionRounds && jobDrive.selectionRounds) {
        req.body.selectionRounds = req.body.selectionRounds.map((newRound, index) => {
          const existingRound = jobDrive.selectionRounds[index];
          return {
            ...newRound,
            // Preserve selectedStudents from existing round if it exists
            selectedStudents: existingRound?.selectedStudents || newRound.selectedStudents || []
          };
        });
      }

      // Update logic for PO
      Object.assign(jobDrive, req.body);
      await jobDrive.save();

      // Emit socket event for job drive update
      const io = req.app.get("io");
      emitJobDriveUpdate(io, "updated", jobDrive);

      return res.json({ message: "Job drive updated successfully", jobDrive });
    }

    // For PRs - check department authorization
    if (
      req.user.role === "placement_representative" ||
      req.user.role === "pr"
    ) {
      // Use the department authorization middleware logic
      const jobDrive = await JobDrive.findById(req.params.id).populate(
        "createdBy",
        "profile.department"
      );
      if (!jobDrive) {
        return res.status(404).json({ message: "Job drive not found" });
      }

      const currentUser = await User.findById(req.user.id);
      const currentUserDept = normalizeDepartment(
        currentUser.profile?.department
      );
      const driveCreatorDept = normalizeDepartment(
        jobDrive.createdBy?.profile?.department
      );

      // Check if same department or drive creator
      if (
        jobDrive.createdBy._id.toString() !== req.user.id &&
        currentUserDept !== driveCreatorDept
      ) {
        return res.status(403).json({
          message:
            "Access denied - Only PRs from the same department can edit this drive",
        });
      }

      // PRESERVE SELECTED STUDENTS DATA when updating selection rounds
      if (req.body.selectionRounds && jobDrive.selectionRounds) {
        req.body.selectionRounds = req.body.selectionRounds.map((newRound, index) => {
          const existingRound = jobDrive.selectionRounds[index];
          return {
            ...newRound,
            // Preserve selectedStudents from existing round if it exists
            selectedStudents: existingRound?.selectedStudents || newRound.selectedStudents || []
          };
        });
      }

      // Update logic for authorized PR
      Object.assign(jobDrive, req.body);
      await jobDrive.save();

      // Emit socket event for job drive update
      const io = req.app.get("io");
      emitJobDriveUpdate(io, "updated", jobDrive);

      return res.json({ message: "Job drive updated successfully", jobDrive });
    }

    return res.status(403).json({ message: "Access denied" });
  } catch (error) {
    console.error("Update job drive error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Debug route to check specific drive data
router.get("/debug/drive/:id", async (req, res) => {
  try {
    const drive = await JobDrive.findById(req.params.id);
    console.log("=== DRIVE DEBUG ===");
    console.log("Drive data:", JSON.stringify(drive, null, 2));
    res.json({
      drive,
      fields: {
        type: drive.type,
        jobType: drive.jobType,
        location: drive.location,
        locations: drive.locations,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get job drives by department
router.get("/department/:department", auth, async (req, res) => {
  try {
    const department = decodeURIComponent(req.params.department);
    console.log("Fetching drives for department:", department);

    const jobDrives = await JobDrive.find({
      isActive: true,
      "eligibility.allowedDepartments": { $in: [department] },
    })
      .populate("createdBy", "email profile")
      .populate("applications.student", "email profile")
      .sort({ createdAt: -1 });

    res.json({
      jobDrives: jobDrives,
      count: jobDrives.length,
    });
  } catch (error) {
    console.error("Error fetching department job drives:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Get students who applied to a specific job drive
router.get("/:id/students", auth, async (req, res) => {
  try {
    const jobDrive = await JobDrive.findById(req.params.id).populate({
      path: "applications.student",
      select: "email profile",
      model: "User",
    });

    if (!jobDrive) {
      return res.status(404).json({ message: "Job drive not found" });
    }

    // Process students with null-safe profile access
    const students = jobDrive.applications
      .map((application) => {
        const student = application.student;
        if (!student) {
          console.log("Warning: Found application with null student");
          return null;
        }

        const profile = student.profile || {};

        return {
          _id: student._id,
          name: profile.name || "N/A",
          email: student.email || "N/A",
          rollNumber: profile.rollNumber || "N/A",
          department: profile.department || "N/A",
          cgpa: profile.cgpa || "N/A",
          phoneNumber: profile.phoneNumber || "N/A",
          degree: profile.degree || "N/A",
          appliedAt: application.appliedAt || new Date(),
          status: application.status || "applied",
        };
      })
      .filter((student) => student !== null);

    console.log(
      `Found ${students.length} students for job drive ${jobDrive.companyName}`
    );
    students.forEach((student) => {
      console.log(`Student: ${student.name} (${student.rollNumber})`);
    });

    res.json({ students });
  } catch (error) {
    console.error("Error fetching job drive students:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Add finalize placement endpoint - Department restricted
router.post(
  "/:id/finalize-placement",
  auth,
  authorizeSameDepartmentPR,
  async (req, res) => {
    try {
      console.log("=== FINALIZE PLACEMENT ===");
      console.log("Drive ID:", req.params.id);
      console.log("User:", req.user.email, "Role:", req.user.role);

      const jobDrive = req.jobDrive; // From middleware

      if (!jobDrive.selectionRounds || jobDrive.selectionRounds.length === 0) {
        return res.status(400).json({ message: "No selection rounds found" });
      }

      // Get the last round
      const lastRound =
        jobDrive.selectionRounds[jobDrive.selectionRounds.length - 1];

      if (
        !lastRound.selectedStudents ||
        lastRound.selectedStudents.length === 0
      ) {
        return res
          .status(400)
          .json({ message: "No students selected in final round" });
      }

      // Check if already finalized
      if (jobDrive.placementFinalized) {
        return res
          .status(400)
          .json({ message: "Placement already finalized for this drive" });
      }

      // Get student details from applications
      const selectedStudentIds = lastRound.selectedStudents.map((id) =>
        id.toString()
      );
      const placedStudents = [];

      for (const application of jobDrive.applications) {
        if (selectedStudentIds.includes(application.student.toString())) {
          // Populate student data
          const studentData = await User.findById(application.student).select(
            "email profile"
          );

          if (studentData && studentData.profile) {
            placedStudents.push({
              name: studentData.profile.name || "N/A",
              rollNumber: studentData.profile.rollNumber || "N/A",
              department: studentData.profile.department || "",
              email: studentData.email || "N/A",
              mobileNumber:
                studentData.profile.phoneNumber ||
                studentData.profile.mobileNumber ||
                "",
              addedBy: req.user.id,
              addedAt: new Date(),
              fromFinalRound: true,
            });
          }
        }
      }

      if (placedStudents.length === 0) {
        return res
          .status(400)
          .json({
            message: "No valid student data found for selected students",
          });
      }

      // Set placed students and mark as finalized
      jobDrive.placedStudents = placedStudents;
      jobDrive.placementFinalized = true;
      await jobDrive.save();

      console.log(
        `✅ Finalized placement for ${placedStudents.length} students in drive ${jobDrive.companyName}`
      );

      res.json({
        message: `Successfully finalized placement for ${placedStudents.length} students`,
        placedStudents: placedStudents,
        totalPlacedStudents: jobDrive.placedStudents.length,
      });
    } catch (error) {
      console.error("Error finalizing placement:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }
);

// Update a specific placed student - Department restricted
router.put(
  "/:id/update-placed-student",
  auth,
  authorizeSameDepartmentPR,
  async (req, res) => {
    try {
      const { index, studentData } = req.body;
      const jobDrive = req.jobDrive; // From middleware

      if (!jobDrive.placedStudents || index >= jobDrive.placedStudents.length) {
        return res.status(400).json({ message: "Invalid student index" });
      }

      jobDrive.placedStudents[index] = {
        ...jobDrive.placedStudents[index],
        ...studentData,
      };
      await jobDrive.save();

      res.json({
        message: "Placed student updated successfully",
        placedStudents: jobDrive.placedStudents,
      });
    } catch (error) {
      console.error("Error updating placed student:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// Delete a specific placed student - Department restricted
router.delete(
  "/:id/delete-placed-student",
  auth,
  authorizeSameDepartmentPR,
  async (req, res) => {
    try {
      const { index } = req.body;
      const jobDrive = req.jobDrive; // From middleware

      if (!jobDrive.placedStudents || index >= jobDrive.placedStudents.length) {
        return res.status(400).json({ message: "Invalid student index" });
      }

      jobDrive.placedStudents.splice(index, 1);
      await jobDrive.save();

      res.json({
        message: "Placed student removed successfully",
        placedStudents: jobDrive.placedStudents,
      });
    } catch (error) {
      console.error("Error removing placed student:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// Update round status
router.patch("/:id/rounds/:roundIndex/status", auth, async (req, res) => {
  try {
    const { status } = req.body;
    const { id, roundIndex } = req.params;

    const jobDrive = await JobDrive.findById(id);
    if (!jobDrive) {
      return res.status(404).json({ message: "Job drive not found" });
    }

    if (
      !jobDrive.selectionRounds ||
      roundIndex >= jobDrive.selectionRounds.length
    ) {
      return res.status(400).json({ message: "Invalid round index" });
    }

    jobDrive.selectionRounds[roundIndex].status = status;
    await jobDrive.save();

    // Emit socket event for real-time updates
    const io = req.app.get('io');
    if (io) {
      emitJobDriveUpdate(io, 'round_status_updated', jobDrive);
    }

    res.json({
      message: "Round status updated successfully",
      selectionRounds: jobDrive.selectionRounds,
    });
  } catch (error) {
    console.error("Update round status error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Select students for next round - Department restricted
router.post(
  "/:id/rounds/:roundIndex/select-students",
  auth,
  authorizeSameDepartmentPR,
  async (req, res) => {
    try {
      const { studentIds } = req.body;
      const { roundIndex } = req.params;

      const jobDrive = req.jobDrive; // From middleware

      if (
        !jobDrive.selectionRounds ||
        roundIndex >= jobDrive.selectionRounds.length
      ) {
        return res.status(400).json({ message: "Invalid round index" });
      }

      jobDrive.selectionRounds[roundIndex].selectedStudents = studentIds;
      await jobDrive.save();

      // Emit socket event for real-time updates
      const io = req.app.get('io');
      if (io) {
        emitJobDriveUpdate(io, 'students_selected', {
          driveId: jobDrive._id,
          companyName: jobDrive.companyName,
          roundIndex,
          roundName: jobDrive.selectionRounds[roundIndex].name,
          selectedCount: studentIds.length,
          selectionRounds: jobDrive.selectionRounds
        });
      }

      res.json({
        message: "Students selected successfully",
        selectionRounds: jobDrive.selectionRounds,
      });
    } catch (error) {
      console.error("Error selecting students for round:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// Add selection rounds to existing job drive
router.post("/:id/add-selection-rounds", auth, async (req, res) => {
  try {
    const { selectionRounds } = req.body;

    const jobDrive = await JobDrive.findById(req.params.id);
    if (!jobDrive) {
      return res.status(404).json({ message: "Job drive not found" });
    }

    jobDrive.selectionRounds = selectionRounds;
    await jobDrive.save();

    // Emit socket event for real-time updates
    const io = req.app.get('io');
    if (io) {
      emitJobDriveUpdate(io, 'selection_rounds_added', jobDrive);
    }

    res.json({
      message: "Selection rounds added successfully",
      jobDrive,
    });
  } catch (error) {
    console.error("Add selection rounds error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Debug route to check application data structure
router.get("/:id/debug-applications", auth, async (req, res) => {
  try {
    const jobDrive = await JobDrive.findById(req.params.id);

    if (!jobDrive) {
      return res.status(404).json({ message: "Job drive not found" });
    }

    console.log("=== DEBUG APPLICATIONS ===");
    console.log("Total applications:", jobDrive.applications.length);

    jobDrive.applications.forEach((app, index) => {
      console.log(`Application ${index + 1}:`, {
        studentId: app.student,
        appliedAt: app.appliedAt,
        status: app.status,
      });
    });

    // Try to populate and see what happens
    const populatedDrive = await JobDrive.findById(req.params.id).populate(
      "applications.student",
      "email profile"
    );

    console.log("=== AFTER POPULATION ===");
    populatedDrive.applications.forEach((app, index) => {
      console.log(`Application ${index + 1}:`, {
        student: app.student,
        hasProfile: !!app.student?.profile,
        profileName: app.student?.profile?.name,
      });
    });

    res.json({
      raw: jobDrive.applications,
      populated: populatedDrive.applications,
    });
  } catch (error) {
    console.error("Debug applications error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Get students by IDs (for round management)
router.post("/:id/get-students-by-ids", auth, async (req, res) => {
  try {
    const { studentIds } = req.body;
    console.log("Getting students by IDs:", studentIds);

    const jobDrive = await JobDrive.findById(req.params.id).populate(
      "applications.student",
      "email profile"
    );

    if (!jobDrive) {
      return res.status(404).json({ message: "Job drive not found" });
    }

    // Find students from the applications
    const students = [];
    for (const application of jobDrive.applications) {
      if (studentIds.includes(application.student._id.toString())) {
        const student = application.student;

        if (student && student.profile) {
          students.push({
            _id: student._id,
            name: student.profile.name || "N/A",
            email: student.email || "N/A",
            rollNumber: student.profile.rollNumber || "N/A",
            department: student.profile.department || "N/A",
            cgpa: student.profile.cgpa || "N/A",
            phoneNumber: student.profile.phoneNumber || "N/A",
            degree: student.profile.degree || "N/A",
            appliedAt: application.appliedAt || new Date(),
            status: application.status || "applied",
          });
        }
      }
    }

    console.log("Found students:", students.length);
    res.json({ students });
  } catch (error) {
    console.error("Error fetching students by IDs:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// View applicants - Department restricted for PRs
router.get("/:id/applicants", auth, async (req, res) => {
  try {
    // POs can view all applicants
    if (req.user.role === "po" || req.user.role === "placement_officer") {
      const jobDrive = await JobDrive.findById(req.params.id).populate(
        "applications.student",
        "email profile"
      );

      if (!jobDrive) {
        return res.status(404).json({ message: "Job drive not found" });
      }

      return res.json({ applicants: jobDrive.applications });
    }

    // For PRs - check department authorization
    if (
      req.user.role === "placement_representative" ||
      req.user.role === "pr"
    ) {
      const jobDrive = await JobDrive.findById(req.params.id)
        .populate("createdBy", "profile.department")
        .populate("applications.student", "email profile");

      if (!jobDrive) {
        return res.status(404).json({ message: "Job drive not found" });
      }

      const currentUser = await User.findById(req.user.id);
      const currentUserDept = normalizeDepartment(
        currentUser.profile?.department
      );
      const driveCreatorDept = normalizeDepartment(
        jobDrive.createdBy?.profile?.department
      );

      // Check if same department or drive creator
      if (
        jobDrive.createdBy._id.toString() === req.user.id ||
        currentUserDept === driveCreatorDept
      ) {
        return res.json({ applicants: jobDrive.applications });
      } else {
        return res.status(403).json({
          message:
            "Access denied - Only PRs from the same department can view applicants",
        });
      }
    }

    return res.status(403).json({ message: "Access denied" });
  } catch (error) {
    console.error("Error fetching applicants:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Get students by IDs for round viewing
router.post("/:id/get-students-by-ids", auth, async (req, res) => {
  try {
    const { studentIds } = req.body;
    console.log("=== GET STUDENTS BY IDS ===");
    console.log("Drive ID:", req.params.id);
    console.log("Student IDs:", studentIds);
    console.log("User:", req.user.email, "Role:", req.user.role);

    if (!studentIds || !Array.isArray(studentIds)) {
      console.log("❌ Invalid student IDs array");
      return res.status(400).json({ message: "Student IDs array is required" });
    }

    // Find the job drive and populate applications
    const jobDrive = await JobDrive.findById(req.params.id).populate({
      path: "applications.student",
      select: "email profile",
    });

    if (!jobDrive) {
      console.log("❌ Job drive not found");
      return res.status(404).json({ message: "Job drive not found" });
    }

    console.log("✅ Job drive found:", jobDrive.companyName);
    console.log("Total applications:", jobDrive.applications.length);

    // Filter applications to get only selected students
    const selectedStudents = [];

    for (const application of jobDrive.applications) {
      if (
        application.student &&
        studentIds.includes(application.student._id.toString())
      ) {
        const student = application.student;
        console.log(
          "Found matching student:",
          student.profile?.name,
          student._id
        );

        selectedStudents.push({
          _id: student._id,
          email: student.email,
          profile: student.profile,
          name: student.profile?.name || "N/A",
          rollNumber: student.profile?.rollNumber || "N/A",
          department: student.profile?.department || "N/A",
          cgpa: student.profile?.cgpa || "N/A",
        });
      }
    }

    console.log("✅ Found students:", selectedStudents.length);
    console.log(
      "Student details:",
      selectedStudents.map((s) => ({
        name: s.name,
        rollNumber: s.rollNumber,
        id: s._id,
      }))
    );

    res.json({
      students: selectedStudents,
      total: selectedStudents.length,
    });
  } catch (error) {
    console.error("❌ Error fetching students by IDs:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Ensure this route exists and is working properly
router.get("/:id/last-round-students", auth, async (req, res) => {
  try {
    console.log("=== FETCHING LAST ROUND STUDENTS ===");
    console.log("Drive ID:", req.params.id);

    const jobDrive = await JobDrive.findById(req.params.id).populate(
      "applications.student",
      "email profile"
    );

    if (!jobDrive) {
      return res.status(404).json({ message: "Job drive not found" });
    }

    console.log("Drive found:", jobDrive.companyName);
    console.log("Selection rounds:", jobDrive.selectionRounds?.length || 0);

    // Get the last round's selected students
    if (!jobDrive.selectionRounds || jobDrive.selectionRounds.length === 0) {
      console.log("No selection rounds found");
      return res.json({ students: [] });
    }

    const lastRound =
      jobDrive.selectionRounds[jobDrive.selectionRounds.length - 1];
    const selectedStudentIds = lastRound.selectedStudents || [];

    console.log("Last round selected students:", selectedStudentIds.length);

    if (selectedStudentIds.length === 0) {
      return res.json({ students: [] });
    }

    // Find students from applications
    const selectedStudents = [];

    for (const application of jobDrive.applications) {
      if (
        application.student &&
        selectedStudentIds.includes(application.student._id.toString())
      ) {
        const student = application.student;
        selectedStudents.push({
          name: student.profile?.name || "N/A",
          rollNumber: student.profile?.rollNumber || "N/A",
          department: student.profile?.department || "N/A",
          email: student.email,
          mobileNumber:
            student.profile?.phone || student.profile?.mobileNumber || "N/A",
          addedAt: new Date(),
        });
      }
    }

    console.log("Formatted students:", selectedStudents.length);
    res.json({ students: selectedStudents });
  } catch (error) {
    console.error("Error fetching last round students:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Get drives for placement representatives (PRs)
router.get("/pr-drives", auth, async (req, res) => {
  try {
    if (
      req.user.role !== "placement_representative" &&
      req.user.role !== "pr"
    ) {
      return res.status(403).json({ message: "Access denied - PRs only" });
    }

    const user = await User.findById(req.user.id);
    if (!user || !user.profile) {
      return res.status(400).json({ message: "User profile not found" });
    }

    const userProfile = user.profile;
    const userCGPA = parseFloat(userProfile.cgpa) || 0;
    const userBacklogs =
      parseInt(userProfile.currentBacklogs || userProfile.backlogs) || 0;
    const userDepartment = userProfile.department;

    // Fix: Use graduationYear as batch if batch is not available
    const userBatch =
      userProfile.batch ||
      (userProfile.graduationYear
        ? userProfile.graduationYear.toString()
        : null);

    const isUserPlaced =
      userProfile.isPlaced || userProfile.placementStatus === "placed";

    console.log("=== PR DRIVES REQUEST ===");
    console.log("PR:", user.email);
    console.log("CGPA:", userCGPA);
    console.log("Backlogs:", userBacklogs);
    console.log("Department:", userDepartment);
    console.log("Batch:", userBatch);
    console.log("Is placed:", isUserPlaced);

    // Get all active drives
    const allDrives = await JobDrive.find({ isActive: true })
      .populate("createdBy", "email profile")
      .populate("applications.student", "email profile")
      .sort({ createdAt: -1 });

    console.log("Total active drives:", allDrives.length);

    // Filter eligible drives for PRs - SAME LOGIC AS STUDENTS
    const eligibleDrives = allDrives.filter((drive) => {
      const eligibility = drive.eligibility || {};

      console.log(`=== CHECKING DRIVE FOR PR: ${drive.companyName} ===`);
      console.log("Drive eligibility:", eligibility);

      // Check CGPA
      if (eligibility.minCGPA && eligibility.minCGPA > userCGPA) {
        console.log(`❌ CGPA not met: ${eligibility.minCGPA} > ${userCGPA}`);
        return false;
      }

      // Check department
      if (
        eligibility.allowedDepartments &&
        eligibility.allowedDepartments.length > 0 &&
        !eligibility.allowedDepartments.includes(userDepartment)
      ) {
        console.log(
          `❌ Department not allowed: ${userDepartment} not in`,
          eligibility.allowedDepartments
        );
        return false;
      }

      // Check backlogs
      if (
        eligibility.maxBacklogs !== undefined &&
        eligibility.maxBacklogs < userBacklogs
      ) {
        console.log(
          `❌ Too many backlogs: ${userBacklogs} > ${eligibility.maxBacklogs}`
        );
        return false;
      }

      // Check batch eligibility
      if (eligibility.allowedBatches && eligibility.allowedBatches.length > 0) {
        if (!userBatch || !eligibility.allowedBatches.includes(userBatch)) {
          console.log(
            `❌ Batch not allowed: ${userBatch} not in`,
            eligibility.allowedBatches
          );
          return false;
        }
      }

      // Check placement status eligibility
      const driveCTC = parseFloat(drive.ctc) || 0;

      // If user is placed, only show drives with CTC > 10 LPA
      if (isUserPlaced && driveCTC <= 10) {
        console.log(`❌ User placed, CTC too low: ${driveCTC} <= 10`);
        return false;
      }

      // If drive is for unplaced only, check placement status
      if (drive.unplacedOnly && isUserPlaced) {
        console.log(`❌ Drive for unplaced only, user is placed`);
        return false;
      }

      console.log(`✅ PR eligible for ${drive.companyName}`);
      return true;
    });

    console.log("Eligible drives for PR:", eligibleDrives.length);

    // Process drives to ensure all fields are properly set
    const processedDrives = eligibleDrives.map((drive) => ({
      ...drive.toObject(),
      type: drive.type || drive.jobType || "full-time",
      jobType: drive.jobType || drive.type || "full-time",
      location:
        drive.location ||
        (drive.locations && drive.locations.length > 0
          ? drive.locations.join(", ")
          : "Not specified"),
      hasApplied: drive.applications.some(
        (app) => app.student.toString() === req.user.id
      ),
    }));

    res.json(processedDrives);
  } catch (error) {
    console.error("Error fetching PR drives:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

module.exports = router;

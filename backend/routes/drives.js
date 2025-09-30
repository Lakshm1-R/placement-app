const express = require('express');
const Drive = require('../models/Drive');
const { auth } = require('../middleware/auth');
const router = express.Router();

// Get stats for dashboard
router.get('/stats', auth, async (req, res) => {
  try {
    const totalDrives = await Drive.countDocuments();
    const upcomingDrives = await Drive.countDocuments({
      date: { $gte: new Date() },
      isActive: true
    });
    
    let totalApplications = 0;
    if (req.user.role === 'student') {
      const drives = await Drive.find({
        'applications.student': req.user.id
      });
      totalApplications = drives.length;
    } else {
      const drives = await Drive.find();
      totalApplications = drives.reduce((sum, drive) => sum + drive.applications.length, 0);
    }

    res.json({
      totalDrives,
      upcomingDrives,
      totalApplications
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all drives (for PO)
router.get('/', auth, async (req, res) => {
  try {
    const drives = await Drive.find()
      .sort({ createdAt: -1 })
      .populate('applications.student', 'profile.name email');
    
    res.json({ drives });
  } catch (error) {
    console.error('Get drives error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get eligible drives for student
router.get('/eligible', auth, async (req, res) => {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const student = req.user;
    const currentDate = new Date();
    
    const eligibleDrives = await Drive.find({
      isActive: true,
      date: { $gte: currentDate },
      $and: [
        {
          $or: [
            { 'eligibility.minCGPA': { $lte: student.profile?.cgpa || 0 } },
            { 'eligibility.minCGPA': { $exists: false } }
          ]
        },
        {
          $or: [
            { 'eligibility.allowedDepartments': { $in: [student.profile?.department] } },
            { 'eligibility.allowedDepartments': { $size: 0 } },
            { 'eligibility.allowedDepartments': { $exists: false } }
          ]
        },
        {
          $or: [
            { 'eligibility.maxBacklogs': { $gte: student.profile?.backlogs || 0 } },
            { 'eligibility.maxBacklogs': { $exists: false } }
          ]
        }
      ]
    }).sort({ date: 1 });

    res.json({ drives: eligibleDrives });
  } catch (error) {
    console.error('Eligible drives error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create new drive
router.post('/', auth, async (req, res) => {
  try {
    if (req.user.role !== 'placementofficer') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const drive = new Drive({
      ...req.body,
      createdBy: req.user.id
    });
    await drive.save();
    
    res.status(201).json({ message: 'Drive created successfully', drive });
  } catch (error) {
    console.error('Create drive error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Apply to drive
router.post('/:id/apply', auth, async (req, res) => {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const drive = await Drive.findById(req.params.id);
    if (!drive) {
      return res.status(404).json({ message: 'Drive not found' });
    }

    // Check if already applied
    const alreadyApplied = drive.applications.some(
      app => app.student.toString() === req.user.id
    );

    if (alreadyApplied) {
      return res.status(400).json({ message: 'Already applied to this drive' });
    }

    drive.applications.push({
      student: req.user.id,
      appliedAt: new Date()
    });

    await drive.save();
    res.json({ message: 'Application submitted successfully' });
  } catch (error) {
    console.error('Apply error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete drive
router.delete('/:id', auth, async (req, res) => {
  try {
    if (req.user.role !== 'placementofficer') {
      return res.status(403).json({ message: 'Access denied' });
    }

    await Drive.findByIdAndDelete(req.params.id);
    res.json({ message: 'Drive deleted successfully' });
  } catch (error) {
    console.error('Delete drive error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;

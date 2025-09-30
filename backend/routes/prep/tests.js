const multer = require('multer');
const axios = require('axios');
const { auth: authMiddleware } = require('../../middleware/auth');
const Test = require('../../models/Test');
const TestAssignment = require('../../models/TestAssignment');
const { importQuiz, createLaunchToken } = require('../../services/quizGateway');
const User = require('../../models/User');
const { emitTestPublished, emitTestUpdated, emitTestDeleted } = require('../../utils/socketUtils');

const router = require('express').Router();

// Map various department representations to canonical codes used in Test
const DEPT_MAP = {
  'CSE': 'CSE',
  'COMPUTER SCIENCE': 'CSE',
  'COMPUTER SCIENCE AND ENGINEERING': 'CSE',
  'IT': 'IT',
  'INFORMATION TECHNOLOGY': 'IT',
  'ECE': 'ECE',
  'ELECTRONICS AND COMMUNICATION ENGINEERING': 'ECE',
  'EEE': 'EEE',
  'ELECTRICAL AND ELECTRONICS ENGINEERING': 'EEE',
  'MECH': 'MECH',
  'MECHANICAL': 'MECH',
  'MECHANICAL ENGINEERING': 'MECH',
  'CIVIL': 'CIVIL',
  'PROD': 'PROD',
  'PRODUCTION': 'PROD',
  'IBT': 'IBT',
  'EIE': 'EIE',
};

const normalizeDepartment = (name) => {
  if (!name) return 'ALL';
  const key = String(name).trim().toUpperCase();
  return DEPT_MAP[key] || key;
};
const upload = multer({ storage: multer.memoryStorage() });

// Create test (PR only)
router.post('/', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'placement_representative' && req.user.role !== 'pr') {
      return res.status(403).json({ message: 'Only PRs can create tests' });
    }

    const { title, description, department, durationMins, startAt, endAt } = req.body;
    const dept = normalizeDepartment(department);
    const test = await Test.create({
      title,
      description,
      department: dept,
      durationMins,
      startAt,
      endAt,
      createdBy: req.user._id,
    });
    res.status(201).json(test);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Import questions spreadsheet (PR only)
router.post('/:id/import', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    if (req.user.role !== 'placement_representative' && req.user.role !== 'pr') {
      return res.status(403).json({ message: 'Only PRs can import tests' });
    }

    const test = await Test.findById(req.params.id);
    if (!test) return res.status(404).json({ message: 'Test not found' });

    const meta = {
      title: test.title,
      department: test.department,
      durationMins: test.durationMins,
    };
    const result = await importQuiz(req.file.buffer, req.file.originalname, meta);
    test.quizBackendId = result.quizBackendId;
    test.totalQuestions = result?.stats?.totalQuestions;
    await test.save();
    res.json({ test });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Publish test (send/enable)
router.post('/:id/publish', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'placement_representative' && req.user.role !== 'pr') {
      return res.status(403).json({ message: 'Only PRs can publish tests' });
    }

    const test = await Test.findById(req.params.id);
    if (!test) return res.status(404).json({ message: 'Test not found' });
    // Allow publishing without quizBackendId when using secured Expo app

    test.status = 'published';
    await test.save();

    // Create assignments for department users
    const deptCode = normalizeDepartment(test.department);
    let users;
    if (deptCode === 'ALL') {
      // Assign to ALL students and ALL PRs
      users = await User.find({
        $or: [
          { role: 'placement_representative' },
          { role: 'pr' },
          { role: 'student' },
        ],
      }).select('_id role');
    } else {
      const possibleNames = [deptCode, 'ALL'];
      // Accept common full names for matching student profiles
      if (deptCode === 'IT') possibleNames.push('Information Technology', 'IT');
      if (deptCode === 'CSE') possibleNames.push('Computer Science', 'Computer Science and Engineering', 'CSE');
      if (deptCode === 'ECE') possibleNames.push('Electronics and Communication Engineering', 'ECE');
      if (deptCode === 'EEE') possibleNames.push('Electrical and Electronics Engineering', 'EEE');
      if (deptCode === 'MECH') possibleNames.push('Mechanical', 'Mechanical Engineering', 'MECH');
      if (deptCode === 'CIVIL') possibleNames.push('Civil', 'Civil Engineering', 'CIVIL');
      if (deptCode === 'PROD') possibleNames.push('Production', 'PROD');
      if (deptCode === 'IBT') possibleNames.push('IBT');
      if (deptCode === 'EIE') possibleNames.push('EIE');

      users = await User.find({
        $or: [
          { role: 'placement_representative' },
          { role: 'pr' },
          { role: 'student', 'profile.department': { $in: possibleNames } },
        ],
      }).select('_id role');
    }

    const bulk = users.map((u) => ({
      updateOne: {
        filter: { testId: test._id, userId: u._id },
        update: {
          $setOnInsert: { testId: test._id, userId: u._id, role: u.role === 'student' ? 'student' : 'placement_representative' },
          $set: { enabled: true },
        },
        upsert: true,
      },
    }));
    if (bulk.length) await TestAssignment.bulkWrite(bulk);

    // Emit socket event if available
    const io = req.app.get('io');
    if (io) {
      emitTestPublished(io, { 
        testId: test._id.toString(), 
        title: test.title, 
        durationMins: test.durationMins, 
        department: test.department,
        description: test.description,
        totalQuestions: test.totalQuestions
      });
    }

    res.json({ message: 'Published', testId: test._id });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// List available tests for current user
router.get('/available', authMiddleware, async (req, res) => {
  try {
    const assignments = await TestAssignment.find({ userId: req.user._id, enabled: true, status: { $ne: 'completed' } }).populate('testId');
    const items = assignments
      .filter((a) => a.testId && a.testId.status === 'published')
      .map((a) => ({
        id: a.testId._id,
        title: a.testId.title,
        department: a.testId.department,
        durationMins: a.testId.durationMins,
        totalQuestions: a.testId.totalQuestions,
        status: a.testId.status,
        assignmentStatus: a.status,
        startAt: a.testId.startAt,
        endAt: a.testId.endAt,
      }));
    res.json({ tests: items });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Start test
router.post('/:id/start', authMiddleware, async (req, res) => {
  try {
    const test = await Test.findById(req.params.id);
    if (!test || test.status !== 'published') return res.status(404).json({ message: 'Test not available' });

    const assignment = await TestAssignment.findOne({ testId: test._id, userId: req.user._id, enabled: true });
    if (!assignment) return res.status(403).json({ message: 'Not assigned or not enabled' });
    if (assignment.status && assignment.status !== 'new') {
      return res.status(400).json({ message: 'Test already started or completed' });
    }

    const now = new Date();
    if (test.startAt && now < test.startAt) return res.status(400).json({ message: 'Test not started yet' });
    if (test.endAt && now > test.endAt) return res.status(400).json({ message: 'Test ended' });

    // Optionally set in_progress
    assignment.status = 'in_progress';
    await assignment.save();

    // Always use secured quiz app (Expo web)
    const expoUrl = process.env.EXPO_QUIZ_URL || 'https://placement-app-sewb.vercel.app/';
    const quizUrl = `${expoUrl.replace(/\/$/, '')}/?quiz=${encodeURIComponent(test.title)}`;
    return res.json({ quizUrl });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Past tests (mine)
router.get('/past', authMiddleware, async (req, res) => {
  try {
    const assignments = await TestAssignment.find({ userId: req.user._id, status: 'completed' }).populate('testId');
    const items = assignments
      .map((a) => a.testId)
      .filter(Boolean)
      .map((t) => ({ id: t._id, title: t.title, department: t.department, durationMins: t.durationMins }));
    res.json({ tests: items });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// PR: list my created tests
router.get('/mine', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'placement_representative' && req.user.role !== 'pr') {
      return res.status(403).json({ message: 'Only PRs can view their tests' });
    }
    const tests = await Test.find({ createdBy: req.user._id }).sort({ createdAt: -1 });
    const items = tests.map((t) => ({
      id: t._id,
      title: t.title,
      description: t.description,
      department: t.department,
      durationMins: t.durationMins,
      status: t.status,
      totalQuestions: t.totalQuestions,
      startAt: t.startAt,
      endAt: t.endAt,
      createdAt: t.createdAt,
    }));
    res.json({ tests: items });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Get single test
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const test = await Test.findById(req.params.id);
    if (!test) return res.status(404).json({ message: 'Test not found' });
    
    // Check if user can view this test
    if (test.createdBy.toString() !== req.user._id.toString() && 
        req.user.role !== 'placement_representative' && req.user.role !== 'pr') {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    res.json(test);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Update test
router.patch('/:id', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'placement_representative' && req.user.role !== 'pr') {
      return res.status(403).json({ message: 'Only PRs can edit tests' });
    }

    const test = await Test.findById(req.params.id);
    if (!test) return res.status(404).json({ message: 'Test not found' });
    
    if (test.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'You can only edit your own tests' });
    }

    const { title, description, department, durationMins, startAt, endAt } = req.body;
    const updates = {};
    
    if (title) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (department) updates.department = normalizeDepartment(department);
    if (durationMins) updates.durationMins = durationMins;
    if (startAt) updates.startAt = new Date(startAt);
    if (endAt) updates.endAt = new Date(endAt);

    const updatedTest = await Test.findByIdAndUpdate(req.params.id, updates, { new: true });
    
    // Emit socket event if available
    const io = req.app.get('io');
    if (io) {
      emitTestUpdated(io, { 
        testId: updatedTest._id.toString(), 
        title: updatedTest.title, 
        department: updatedTest.department,
        status: updatedTest.status
      });
    }
    
    res.json(updatedTest);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Delete test
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'placement_representative' && req.user.role !== 'pr') {
      return res.status(403).json({ message: 'Only PRs can delete tests' });
    }

    const test = await Test.findById(req.params.id);
    if (!test) return res.status(404).json({ message: 'Test not found' });
    
    if (test.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'You can only delete your own tests' });
    }

    // Also delete related assignments
    await TestAssignment.deleteMany({ testId: req.params.id });
    await Test.findByIdAndDelete(req.params.id);
    
    // Emit socket event if available
    const io = req.app.get('io');
    if (io) {
      emitTestDeleted(io, { 
        testId: req.params.id, 
        title: test.title, 
        department: test.department
      });
    }
    
    res.json({ message: 'Test deleted successfully' });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;



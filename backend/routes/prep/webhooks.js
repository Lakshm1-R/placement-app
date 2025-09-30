const bodyParser = require('body-parser');
const { verifyQuizSignature } = require('../../services/quizGateway');
const Test = require('../../models/Test');
const TestAssignment = require('../../models/TestAssignment');
const TestSubmission = require('../../models/TestSubmission');

const router = require('express').Router();

// Quick health check to verify the router is mounted
router.get('/ping', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.EXPO_QUIZ_URL || 'https://placement-app-sewb.vercel.app/');
  return res.json({ ok: true, route: '/api/prep/webhooks/ping' });
});

// Raw body parser for signature verification
router.post('/quiz/submission', bodyParser.raw({ type: '*/*' }), async (req, res) => {
  try {
    const signature = req.header('X-Quiz-Signature');
    const rawBody = req.body.toString('utf8');
    if (!verifyQuizSignature(rawBody, signature)) {
      return res.status(401).json({ message: 'Invalid signature' });
    }

    const payload = JSON.parse(rawBody);
    const { quizBackendId, quizSessionId, userId, testId, score, total, correctCount, answers, submittedAt } = payload;

    const test = await Test.findById(testId);
    if (!test) {
      return res.status(404).json({ message: 'Test not found' });
    }

    await TestSubmission.updateOne(
      { testId, userId },
      { $set: { testId, userId, quizSessionId, score, total, correctCount, answers, submittedAt: new Date(submittedAt) } },
      { upsert: true }
    );

    await TestAssignment.updateOne(
      { testId, userId },
      { $set: { status: 'completed' } }
    );

    const io = req.app.get('io');
    if (io) {
      io.emit('test:completed', { testId, userId, score, total });
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Simple submission endpoint (no signature) for secured quiz app
// Body: { quizTitle, registerNo, score, total }

// Basic request logger for this router
router.use((req, res, next) => {
  try {
    console.log('[prep/webhooks]', req.method, req.originalUrl);
  } catch (_) {}
  next();
});

router.options('/quiz/submission-simple', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.EXPO_QUIZ_URL || 'https://placement-app-sewb.vercel.app/');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  return res.sendStatus(204);
});

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const handleSimpleSubmission = async (req, res) => {
  try {
    const { quizTitle, registerNo, score, total } = req.body || {};
    if (!quizTitle || !registerNo) {
      return res.status(400).json({ message: 'quizTitle and registerNo are required' });
    }

    const normalizedTitle = String(quizTitle).trim();
    const titleRegex = new RegExp(`^${escapeRegex(normalizedTitle)}$`, 'i');
    let test = await Test.findOne({ title: titleRegex });

    // Find user by register number (case-insensitive, trim)
    const normalizedReg = String(registerNo).trim();
    const regRegex = new RegExp(`^${escapeRegex(normalizedReg)}$`, 'i');
    const User = require('../../models/User');
    const user = await User.findOne({
      $or: [
        { 'profile.registerNo': regRegex },
        { 'profile.registerNumber': regRegex },
        { 'profile.register_no': regRegex },
      ],
    });
    let resolvedUser = user;

    // If test not found by title, fall back to user's most recent pending assignment
    if (!test && resolvedUser) {
      const pendingAssignment = await TestAssignment.findOne({
        userId: resolvedUser._id,
        status: { $in: ['in_progress', 'new'] },
      }).sort({ _id: -1 });
      if (pendingAssignment) test = await Test.findById(pendingAssignment.testId);
    }

    // If user not found by register number but test is known, attribute to the latest in_progress assignment for this test
    if (!resolvedUser && test) {
      const anyInProgress = await TestAssignment.findOne({ testId: test._id, status: 'in_progress' }).sort({ _id: -1 });
      if (anyInProgress) {
        resolvedUser = { _id: anyInProgress.userId };
      }
    }

    if (!test || !resolvedUser) {
      // Accept request but do not update DB (prevents UI error spam)
      res.setHeader('Access-Control-Allow-Origin', process.env.EXPO_QUIZ_URL || 'https://placement-app-sewb.vercel.app/');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      return res.status(200).json({ ok: true, note: 'Submission accepted, awaiting proper mapping (test/user not resolved)' });
    }

    await TestSubmission.updateOne(
      { testId: test._id, userId: resolvedUser._id },
      { $set: { testId: test._id, userId: resolvedUser._id, score, total, submittedAt: new Date() } },
      { upsert: true }
    );

    await TestAssignment.updateOne(
      { testId: test._id, userId: resolvedUser._id },
      { $set: { status: 'completed', enabled: true } },
      { upsert: true }
    );

    const io = req.app.get('io');
    if (io) {
      io.emit('test:completed', { testId: test._id.toString(), userId: String(resolvedUser._id), score, total });
    }

    res.setHeader('Access-Control-Allow-Origin', process.env.EXPO_QUIZ_URL || 'https://placement-app-sewb.vercel.app/');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    return res.json({ ok: true });
  } catch (err) {
    res.setHeader('Access-Control-Allow-Origin', process.env.EXPO_QUIZ_URL || 'https://placement-app-sewb.vercel.app/');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    return res.status(400).json({ message: err.message });
  }
};

router.post('/quiz/submission-simple', bodyParser.json(), handleSimpleSubmission);
router.post('/quiz/submission-simple/', bodyParser.json(), handleSimpleSubmission);

// Alias without the /quiz segment (in case clients call this path)
router.options('/submission-simple', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.EXPO_QUIZ_URL || 'https://placement-app-sewb.vercel.app/');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  return res.sendStatus(204);
});

router.post('/submission-simple', bodyParser.json(), handleSimpleSubmission);
router.post('/submission-simple/', bodyParser.json(), handleSimpleSubmission);

module.exports = router;

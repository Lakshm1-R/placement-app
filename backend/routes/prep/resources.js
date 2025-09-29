const { auth: authMiddleware } = require('../../middleware/auth');
const Resource = require('../../models/Resource');
const { emitResourceAdded } = require('../../utils/socketUtils');

const router = require('express').Router();

// List resources with optional department filter
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { department } = req.query;
    const filter = {};
    if (department && department !== 'ALL') {
      filter.$or = [{ department }, { department: 'ALL' }];
    }
    const items = await Resource.find(filter).sort({ createdAt: -1 });
    res.json({ resources: items });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Add resource (PR only)
router.post('/', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'placement_representative' && req.user.role !== 'pr') {
      return res.status(403).json({ message: 'Only PRs can add resources' });
    }
    const { title, type, department = 'ALL', urlOrPath, meta, description } = req.body;
    const item = await Resource.create({ 
      title, 
      type, 
      department, 
      urlOrPath, 
      meta, 
      description,
      createdBy: req.user._id 
    });

    // Emit socket event if available
    const io = req.app.get('io');
    if (io) {
      emitResourceAdded(io, {
        resourceId: item._id.toString(),
        title: item.title,
        type: item.type,
        department: item.department,
        addedBy: req.user.profile?.name || req.user.email
      });
    }

    res.status(201).json(item);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;



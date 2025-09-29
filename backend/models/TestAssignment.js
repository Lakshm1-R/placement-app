const mongoose = require('mongoose');

const testAssignmentSchema = new mongoose.Schema(
  {
    testId: { type: mongoose.Schema.Types.ObjectId, ref: 'Test', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['student', 'placement_representative'], required: true },
    enabled: { type: Boolean, default: false },
    status: { type: String, enum: ['new', 'in_progress', 'completed'], default: 'new' },
  },
  { timestamps: true }
);

testAssignmentSchema.index({ testId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('TestAssignment', testAssignmentSchema);




const mongoose = require('mongoose');

const testSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String },
    department: {
      type: String,
      enum: ['CSE', 'IT', 'ECE', 'MECH', 'PROD', 'IBT', 'EEE', 'CIVIL', 'EIE', 'ALL'],
      required: true,
    },
    durationMins: { type: Number, required: true },
    status: { type: String, enum: ['draft', 'published', 'closed'], default: 'draft' },
    startAt: { type: Date },
    endAt: { type: Date },
    quizBackendId: { type: String },
    totalQuestions: { type: Number },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Test', testSchema);




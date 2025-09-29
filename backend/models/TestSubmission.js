const mongoose = require('mongoose');

const answerSchema = new mongoose.Schema(
  {
    q: { type: String },
    correct: { type: Boolean },
  },
  { _id: false }
);

const testSubmissionSchema = new mongoose.Schema(
  {
    testId: { type: mongoose.Schema.Types.ObjectId, ref: 'Test', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    quizSessionId: { type: String },
    score: { type: Number, required: true },
    total: { type: Number, required: true },
    correctCount: { type: Number },
    answers: [answerSchema],
    submittedAt: { type: Date, required: true },
  },
  { timestamps: true }
);

testSubmissionSchema.index({ testId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('TestSubmission', testSubmissionSchema);




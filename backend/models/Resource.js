const mongoose = require('mongoose');

const resourceSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    type: { type: String, enum: ['pdf', 'link', 'video', 'sample_test'], required: true },
    department: {
      type: String,
      enum: ['CSE', 'IT', 'ECE', 'MECH', 'PROD', 'IBT', 'EEE', 'CIVIL', 'EIE', 'ALL'],
      default: 'ALL',
    },
    urlOrPath: { type: String, required: true },
    meta: { type: Object },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Resource', resourceSchema);




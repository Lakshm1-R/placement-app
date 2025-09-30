const mongoose = require('mongoose');

const cgpaReferenceSchema = new mongoose.Schema({
  rollNumber: { 
    type: String, 
    required: true, 
    unique: true,
    uppercase: true // Store in uppercase for consistent matching
  },
  cgpa: { 
    type: Number, 
    required: true 
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('CGPAReference', cgpaReferenceSchema);
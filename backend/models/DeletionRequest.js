const mongoose = require("mongoose");

const deletionRequestSchema = new mongoose.Schema(
  {
    jobDrive: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JobDrive",
      required: true,
    },
    // Store job drive details for reference after deletion
    jobDriveDetails: {
      companyName: String,
      role: String,
      date: Date,
      createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    reason: {
      type: String,
      required: true,
      maxlength: 500,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    reviewedAt: {
      type: Date,
    },
    reviewComments: {
      type: String,
      maxlength: 500,
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient queries
deletionRequestSchema.index({ status: 1, createdAt: -1 });
deletionRequestSchema.index({ requestedBy: 1 });
deletionRequestSchema.index({ jobDrive: 1 });

module.exports = mongoose.model("DeletionRequest", deletionRequestSchema);

const express = require("express");
const router = express.Router();
const DeletionRequest = require("../models/DeletionRequest");
const JobDrive = require("../models/JobDrive");
const User = require("../models/User");
const { auth } = require("../middleware/auth");
const {
  emitDeletionRequestUpdate,
  emitJobDriveUpdate,
} = require("../utils/socketUtils");

// Create deletion request (PR or PO)
router.post("/request", auth, async (req, res) => {
  try {
    const { jobDriveId, reason } = req.body;

    if (!jobDriveId || !reason) {
      return res.status(400).json({
        message: "Job Drive ID and reason are required",
      });
    }

    // Verify job drive exists
    const jobDrive = await JobDrive.findById(jobDriveId);
    if (!jobDrive) {
      return res.status(404).json({ message: "Job drive not found" });
    }

    // Check if user has permission to request deletion
    const canRequestDeletion =
      req.user.role === "po" ||
      req.user.role === "placement_officer" ||
      req.user.role === "placement_representative" ||
      req.user.role === "pr";

    if (!canRequestDeletion) {
      return res.status(403).json({
        message: "Access denied - Only PRs and POs can request deletion",
      });
    }

    // Check if there's already a pending request for this drive
    const existingRequest = await DeletionRequest.findOne({
      jobDrive: jobDriveId,
      status: "pending",
    });

    if (existingRequest) {
      return res.status(400).json({
        message: "A deletion request for this drive is already pending",
      });
    }

    // For POs, auto-approve the deletion request
    if (req.user.role === "po" || req.user.role === "placement_officer") {
      // Store job drive details before deletion
      const jobDriveDetails = {
        companyName: jobDrive.companyName,
        role: jobDrive.role,
        date: jobDrive.date,
        createdBy: jobDrive.createdBy,
      };

      // Delete the job drive
      await JobDrive.findByIdAndDelete(jobDriveId);

      // Create an approved deletion request for records
      const deletionRequest = new DeletionRequest({
        jobDrive: jobDriveId,
        jobDriveDetails,
        requestedBy: req.user.id,
        reason,
        status: "approved",
        reviewedBy: req.user.id,
        reviewedAt: new Date(),
        reviewComments: "Auto-approved (Placement Officer action)",
      });

      await deletionRequest.save();

      // Emit socket event for job drive deletion
      const io = req.app.get("io");
      emitJobDriveUpdate(io, "deleted", jobDriveDetails);
      emitDeletionRequestUpdate(io, "approved", deletionRequest);

      return res.json({
        message: "Job drive deleted successfully",
        deletionRequest: await deletionRequest.populate([
          "requestedBy",
          "reviewedBy",
          "jobDriveDetails.createdBy",
        ]),
      });
    }

    // For PRs, create a pending deletion request
    const deletionRequest = new DeletionRequest({
      jobDrive: jobDriveId,
      jobDriveDetails: {
        companyName: jobDrive.companyName,
        role: jobDrive.role,
        date: jobDrive.date,
        createdBy: jobDrive.createdBy,
      },
      requestedBy: req.user.id,
      reason,
    });

    await deletionRequest.save();
    await deletionRequest.populate([
      "jobDrive",
      "requestedBy",
      "jobDriveDetails.createdBy",
    ]);

    // Emit socket event for new deletion request
    const io = req.app.get("io");
    emitDeletionRequestUpdate(io, "created", deletionRequest);

    res.status(201).json({
      message: "Deletion request submitted successfully. Awaiting PO approval.",
      deletionRequest,
    });
  } catch (error) {
    console.error("Error creating deletion request:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Get all deletion requests (PO only)
router.get("/pending", auth, async (req, res) => {
  try {
    if (req.user.role !== "po" && req.user.role !== "placement_officer") {
      return res.status(403).json({
        message: "Access denied - Only POs can view deletion requests",
      });
    }

    const deletionRequests = await DeletionRequest.find({ status: "pending" })
      .populate("jobDrive", "companyName role date createdBy")
      .populate("requestedBy", "email profile")
      .sort({ createdAt: -1 });

    res.json({ deletionRequests });
  } catch (error) {
    console.error("Error fetching deletion requests:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Get deletion requests by current user
router.get("/my-requests", auth, async (req, res) => {
  try {
    const deletionRequests = await DeletionRequest.find({
      requestedBy: req.user.id,
    })
      .populate("jobDrive", "companyName role date")
      .populate("reviewedBy", "email profile")
      .sort({ createdAt: -1 });

    res.json({ deletionRequests });
  } catch (error) {
    console.error("Error fetching user deletion requests:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Approve/Reject deletion request (PO only)
router.patch("/:requestId/review", auth, async (req, res) => {
  try {
    if (req.user.role !== "po" && req.user.role !== "placement_officer") {
      return res.status(403).json({
        message: "Access denied - Only POs can review deletion requests",
      });
    }

    const { action, comments } = req.body; // action: 'approve' or 'reject'

    if (!action || !["approve", "reject"].includes(action)) {
      return res.status(400).json({
        message: 'Invalid action. Must be "approve" or "reject"',
      });
    }

    const deletionRequest = await DeletionRequest.findById(
      req.params.requestId
    ).populate("jobDrive");

    if (!deletionRequest) {
      return res.status(404).json({ message: "Deletion request not found" });
    }

    if (deletionRequest.status !== "pending") {
      return res.status(400).json({
        message: "This deletion request has already been reviewed",
      });
    }

    // Store job drive details before potential deletion
    if (
      deletionRequest.jobDrive &&
      !deletionRequest.jobDriveDetails.companyName
    ) {
      deletionRequest.jobDriveDetails = {
        companyName: deletionRequest.jobDrive.companyName,
        role: deletionRequest.jobDrive.role,
        date: deletionRequest.jobDrive.date,
        createdBy: deletionRequest.jobDrive.createdBy,
      };
    }

    // Update deletion request
    deletionRequest.status = action === "approve" ? "approved" : "rejected";
    deletionRequest.reviewedBy = req.user.id;
    deletionRequest.reviewedAt = new Date();
    deletionRequest.reviewComments = comments || "";

    await deletionRequest.save();

    // If approved, delete the job drive
    if (action === "approve" && deletionRequest.jobDrive) {
      await JobDrive.findByIdAndDelete(deletionRequest.jobDrive._id);

      // Emit socket event for job drive deletion
      const io = req.app.get("io");
      emitJobDriveUpdate(io, "deleted", deletionRequest.jobDriveDetails);
    }

    await deletionRequest.populate(["requestedBy", "reviewedBy"]);

    // Emit socket event for deletion request review
    const io = req.app.get("io");
    emitDeletionRequestUpdate(
      io,
      action === "approve" ? "approved" : "rejected",
      deletionRequest
    );

    res.json({
      message: `Deletion request ${
        action === "approve" ? "approved" : "rejected"
      } successfully`,
      deletionRequest,
    });
  } catch (error) {
    console.error("Error reviewing deletion request:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Get all deletion requests with filters (PO only)
router.get("/all", auth, async (req, res) => {
  try {
    if (req.user.role !== "po" && req.user.role !== "placement_officer") {
      return res.status(403).json({
        message: "Access denied - Only POs can view all deletion requests",
      });
    }

    const { status } = req.query;
    const filter = {};
    if (status && ["pending", "approved", "rejected"].includes(status)) {
      filter.status = status;
    }

    const deletionRequests = await DeletionRequest.find(filter)
      .populate("jobDrive", "companyName role date")
      .populate("requestedBy", "email profile")
      .populate("reviewedBy", "email profile")
      .sort({ createdAt: -1 });

    res.json({ deletionRequests });
  } catch (error) {
    console.error("Error fetching all deletion requests:", error);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;

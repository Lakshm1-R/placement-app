const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

console.log("Starting to load routes...");

console.log("Loading auth routes...");
const authRoutes = require("./routes/auth");
console.log("Auth routes type:", typeof authRoutes);

console.log("Loading job-drives routes...");
const jobDriveRoutes = require("./routes/jobDrives");
console.log("JobDrive routes type:", typeof jobDriveRoutes);

console.log("Loading users routes...");
const userRoutes = require("./routes/users");
console.log("User routes type:", typeof userRoutes);

console.log("Loading profile routes...");
const profileRoutes = require("./routes/profile");
console.log("Profile routes type:", typeof profileRoutes);

console.log("Loading placement-consent routes...");
const placementConsentRoutes = require("./routes/placementConsent");
console.log("Placement routes type:", typeof placementConsentRoutes);

console.log("Loading placement-analytics routes...");
const placementAnalyticsRoutes = require("./routes/placementAnalytics");
console.log(
  "Placement Analytics routes type:",
  typeof placementAnalyticsRoutes
);
console.log(
  "🔥🔥🔥 CHECKPOINT: About to load deletion-requests - FILE VERSION 2.0 🔥🔥🔥"
);

// DELETION REQUESTS LOADING
console.log("Now loading deletion-requests routes...");
let deletionRequestRoutes;
try {
  deletionRequestRoutes = require("./routes/deletionRequests");
  console.log(
    "✅ SUCCESS: Deletion requests loaded, type:",
    typeof deletionRequestRoutes
  );
} catch (err) {
  console.error("❌ FAILED to load deletion requests:", err.message);
  // Create fallback router
  const express = require("express");
  deletionRequestRoutes = express.Router();
  deletionRequestRoutes.all("*", (req, res) => {
    res.status(503).json({ error: "Deletion requests service unavailable" });
  });
}

console.log("All routes loading completed");

// Use routes
app.use("/api/auth", authRoutes);
app.use("/api/job-drives", jobDriveRoutes);
app.use("/api/users", userRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/placement-consent", placementConsentRoutes);
app.use("/api/placement-analytics", placementAnalyticsRoutes);
app.use("/api/deletion-requests", deletionRequestRoutes);

// Placement Preparation routes (mirror of server.js)
try {
  const prepTests = require("./routes/prep/tests");
  const prepResources = require("./routes/prep/resources");
  const prepWebhooks = require("./routes/prep/webhooks");
  app.use("/api/prep/tests", prepTests);
  app.use("/api/prep/resources", prepResources);
  app.use("/api/prep/webhooks", prepWebhooks);
  console.log("Prep routes mounted in app.js");
} catch (e) {
  console.error("Failed to mount prep routes in app.js", e.message);
}

// Test route
app.get("/api/test", (req, res) => {
  res.json({ message: "Backend is working!" });
});

// Test deletion requests route manually
app.get("/api/deletion-requests/test", (req, res) => {
  res.json({ message: "Deletion requests endpoint is working!" });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: "Something went wrong!" });
});

// 404 handler
app.use("*", (req, res) => {
  console.log("404 - Route not found:", req.originalUrl);
  res.status(404).json({ message: "Route not found" });
});

const PORT = process.env.PORT || 5000;

mongoose
  .connect(
    process.env.MONGODB_URI || "mongodb://localhost:27017/placement-system"
  )
  .then(() => {
    console.log("MongoDB connected successfully");
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log("Available routes:");
      console.log("- /api/auth");
      console.log("- /api/job-drives");
      console.log("- /api/users");
      console.log("- /api/profile");
      console.log("- /api/placement-consent");
      console.log("- /api/placement-analytics");
      console.log("- /api/deletion-requests");
    });
  })
  .catch((error) => {
    console.error("MongoDB connection error:", error);
  });

module.exports = app;

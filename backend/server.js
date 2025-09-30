require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const session = require("express-session");
const passport = require("./config/passport");
const path = require("path");
const placementConsentRoutes = require("./routes/placementConsent");
const http = require("http");
const { Server } = require("socket.io");

// Sensible defaults for quiz integration if not provided via .env
process.env.EXPO_QUIZ_URL = process.env.EXPO_QUIZ_URL || "https://placement-app-sewb.vercel.app/";
process.env.QUIZ_LAUNCH_MODE = process.env.QUIZ_LAUNCH_MODE || "expo";
// Point to deployed quiz backend by default in production to avoid localhost
process.env.QUIZ_BASE_URL = process.env.QUIZ_BASE_URL || "https://placement-app-kg7c.onrender.com";
process.env.QUIZ_RUN_URL = process.env.QUIZ_RUN_URL || process.env.QUIZ_BASE_URL;

// Force secured quiz app usage
process.env.QUIZ_LAUNCH_MODE = "expo";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "https://placement-app-omega.vercel.app",
    methods: ["GET", "POST"],
  },
});

// Make io accessible throughout the app
app.set("io", io);

// Middleware
// Allow frontend (3000) and secured quiz app (19006) to call the API
const allowedOrigins = [
  (process.env.CLIENT_URL || "https://placement-app-omega.vercel.app").replace(/\/$/, ""),
  (process.env.EXPO_QUIZ_URL || "https://placement-app-sewb.vercel.app/").replace(/\/$/, ""),
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true); // allow same-origin/non-browser
      const o = origin.replace(/\/$/, "");
      if (allowedOrigins.includes(o)) return callback(null, true);
      return callback(null, false);
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    credentials: true,
    optionsSuccessStatus: 204,
  })
);
app.use(express.json());

// Serve uploaded files statically
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
// Serve uploaded signature files
app.use(
  "/uploads/signatures",
  express.static(path.join(__dirname, "uploads/signatures"))
);

// Session middleware (required for passport)
app.use(
  session({
    secret:
      process.env.SESSION_SECRET ||
      "s8f9230f23u29f3nq38nq328nfs9d8vnasdvn2398vn",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }, // Set to true in production with HTTPS
  })
);

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// Test route
app.get("/api/test", (req, res) => {
  res.json({
    message: "Server is running",
    timestamp: new Date().toISOString(),
  });
});

// Routes - Comment out all and add back one by one
console.log("Starting to load routes...");

// Test each route individually
try {
  console.log("Loading auth routes...");
  const authRoutes = require("./routes/auth");
  console.log("Auth routes type:", typeof authRoutes);
  app.use("/api/auth", authRoutes);
} catch (error) {
  console.error("Error with auth routes:", error.message);
}

try {
  console.log("Loading job-drives routes...");
  const jobDriveRoutes = require("./routes/jobDrives");
  console.log("JobDrive routes type:", typeof jobDriveRoutes);
  app.use("/api/job-drives", jobDriveRoutes);
} catch (error) {
  console.error("Error with job-drives routes:", error.message);
}

try {
  console.log("Loading users routes...");
  const userRoutes = require("./routes/users");
  console.log("User routes type:", typeof userRoutes);
  app.use("/api/users", userRoutes);
} catch (error) {
  console.error("Error with users routes:", error.message);
}

try {
  console.log("Loading profile routes...");
  const profileRoutes = require("./routes/profile");
  console.log("Profile routes type:", typeof profileRoutes);
  app.use("/api/profile", profileRoutes);
} catch (error) {
  console.error("Error with profile routes:", error.message);
}

try {
  console.log("Loading placement-consent routes...");
  const placementRoutes = require("./routes/placementConsent");
  console.log("Placement routes type:", typeof placementRoutes);
  app.use("/api/placement-consent", placementRoutes);
} catch (error) {
  console.error("Error with placement-consent routes:", error.message);
}

try {
  console.log("Loading placement-analytics routes...");
  const placementAnalyticsRoutes = require("./routes/placementAnalytics");
  console.log(
    "Placement Analytics routes type:",
    typeof placementAnalyticsRoutes
  );
  app.use("/api/placement-analytics", placementAnalyticsRoutes);
} catch (error) {
  console.error("Error with placement-analytics routes:", error.message);
}

try {
  console.log("Loading deletion-requests routes...");
  const deletionRequestRoutes = require("./routes/deletionRequests");
  console.log("Deletion requests routes type:", typeof deletionRequestRoutes);
  app.use("/api/deletion-requests", deletionRequestRoutes);
} catch (error) {
  console.error("Error with deletion-requests routes:", error.message);
}

console.log("Finished loading routes");

// Placement Preparation routes
try {
  console.log("Loading placement preparation routes...");
  const prepTests = require("./routes/prep/tests");
  const prepResources = require("./routes/prep/resources");
  const prepWebhooks = require("./routes/prep/webhooks");
  app.use("/api/prep/tests", prepTests);
  app.use("/api/prep/resources", prepResources);
  app.use("/api/prep/webhooks", prepWebhooks);
} catch (error) {
  console.error("Error with placement preparation routes:", error.message);
}

// Socket.IO connection handling
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // Join user to their role-specific room
  socket.on("join-room", (userData) => {
    if (userData?.role) {
      socket.join(userData.role);
      console.log(`User ${socket.id} joined room: ${userData.role}`);
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Server error:", err);
  res.status(500).json({ message: "Something went wrong!" });
});

// MongoDB connection
mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

mongoose.connection.on("connected", () => {
  console.log("MongoDB connected successfully");
});

mongoose.connection.on("error", (err) => {
  console.error("MongoDB connection error:", err);
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

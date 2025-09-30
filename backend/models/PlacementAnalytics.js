const mongoose = require("mongoose");

const placementAnalyticsSchema = new mongoose.Schema(
  {
    batch: {
      type: String,
      required: true,
      unique: true,
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    data: [
      {
        type: mongoose.Schema.Types.Mixed,
      },
    ],
    statistics: {
      totalStudents: { type: Number, default: 0 },
      placedStudents: { type: Number, default: 0 },
      placementRate: { type: Number, default: 0 },
      averagePackage: { type: Number, default: 0 },
      highestPackage: { type: Number, default: 0 },
      lowestPackage: { type: Number, default: 0 },
      totalCompanies: { type: Number, default: 0 },
      departmentStats: [
        {
          department: String,
          totalStudents: Number,
          placedStudents: Number,
          placementRate: Number,
          highestPackage: Number,
          lowestPackage: Number,
          totalCompanies: Number,
          companies: [
            {
              name: String,
              studentsPlaced: Number,
              averagePackage: Number,
              packages: [Number],
            },
          ],
        },
      ],
      companyStats: [
        {
          name: String,
          studentsPlaced: Number,
          averagePackage: Number,
          highestPackage: Number,
          lowestPackage: Number,
        },
      ],
    },
    fileName: String,
    filePath: String,
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("PlacementAnalytics", placementAnalyticsSchema);

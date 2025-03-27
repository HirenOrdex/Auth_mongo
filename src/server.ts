import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import mongoose from "mongoose";
import authRoutes from "./routes/auth.routes";
import connectDB from "./configs/dbConfig";
import { PORT } from "./configs/envConfigs";


const app = express();

// Middleware
app.use(express.json());
app.use(cors());
app.use(helmet());

// Routes
app.use("/api/auth", authRoutes);

// Connect to MongoDB
connectDB();
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

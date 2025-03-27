import mongoose from "mongoose";
import { MONGO_URI } from "./envConfigs";

const connectDB = async () => {
  try {
    console.log('MONGO_URI',MONGO_URI)
    await mongoose.connect(MONGO_URI, {
        dbName: "AUTH", // Ensures database name is set properly
      })    
      console.log("✅ MongoDB Connected Successfully");
  } catch (error) {
    console.error('MONGO_URI',MONGO_URI)
    console.error("❌ MongoDB Connection Failed:", error);
    process.exit(1); // Exit process with failure
  }
};

export default connectDB;

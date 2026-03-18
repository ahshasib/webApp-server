import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose"; 

dotenv.config();

const app = express();

// middleware
app.use(cors());
app.use(express.json());

// MongoDB connect
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected ✅"))
  .catch((err) => console.log(err));

// 🔹 Withdrawal Schema + Model
const withdrawalSchema = new mongoose.Schema({
  userId: { type: String, required: true }, // user id
  amount: { type: Number, required: true },
  fundPassword: { type: String, required: true },
  status: { type: String, enum: ["pending", "confirmed"], default: "pending" },
}, { timestamps: true });

const Withdrawal = mongoose.model("Withdrawal", withdrawalSchema); // 👈 model create

// User submits withdrawal request
app.post("/withdrawal/request", async (req, res) => {
  try {
    const { userId, amount, fundPassword } = req.body;

    if (!userId || !amount || !fundPassword) {
      return res.status(400).json({ message: "All fields required" });
    }

    const newRequest = new Withdrawal({ userId, amount, fundPassword });
    await newRequest.save();

    res.json({ message: "Withdrawal request submitted successfully!" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Admin confirms withdrawal
app.post("/withdrawal/confirm/:id", async (req, res) => {
  try {
    const withdrawal = await Withdrawal.findById(req.params.id);
    if (!withdrawal) return res.status(404).json({ message: "Not found" });

    withdrawal.status = "confirmed";
    await withdrawal.save();

    res.json({ message: "Withdrawal confirmed successfully!" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get all pending withdrawals (Admin)
app.get("/withdrawal/pending", async (req, res) => {
  try {
    const withdrawals = await Withdrawal.find({ status: "pending" });
    res.json(withdrawals);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// test route
app.get("/", (req, res) => {
  res.send("Server is running 🚀");
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
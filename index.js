import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose"; 
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

dotenv.config();

const app = express();

// middleware
app.use(cors());
app.use(express.json());

// MongoDB connect
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected ✅"))
  .catch((err) => console.log(err));


// login and registration api start from here

// Schema
const userSchema = new mongoose.Schema({
  phone: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  invitationCode: String,
}, { timestamps: true });

const User = mongoose.model("User", userSchema);

// REGISTER
app.post("/api/register", async (req, res) => {
  try {
    const { phone, password, confirmPassword, invitationCode } = req.body;

    if (!phone || !password) {
      return res.status(400).json({ message: "সব field পূরণ করুন" });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ message: "Password not match" });
    }

    const exist = await User.findOne({ phone });

    if (exist) {
      return res.status(400).json({ message: "এই নাম্বারে আগেই account আছে" });
    }

    const hash = await bcrypt.hash(password, 10);

    await User.create({
      phone,
      password: hash,
      invitationCode,
    });

    res.json({ message: "Register success ✅" });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// LOGIN
app.post("/api/login", async (req, res) => {
  try {
    const { phone, password } = req.body;

    const user = await User.findOne({ phone });

    // ❌ user নাই → register করতে বলবে
    if (!user) {
      return res.status(400).json({
        message: "Account নেই, আগে Register করুন ❗"
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    // ❌ password ভুল
    if (!isMatch) {
      return res.status(400).json({
        message: "Wrong password ❌"
      });
    }

    const token = jwt.sign(
      { id: user._id },
      "secret123",
      { expiresIn: "7d" }
    );

    res.json({
      message: "Login success ✅",
      token,
      user
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


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
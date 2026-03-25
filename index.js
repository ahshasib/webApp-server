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


// auth middleware
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;

if (!authHeader) {
  return res.status(401).json({ message: "No token" });
}

const token = authHeader.split(" ")[1]; // ✅ Bearer remove

try {
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  req.userId = decoded.id;
  next();
} catch (err) {
  return res.status(401).json({ message: "Invalid token" });
}
};

// login and registration api start from here

// Schema
const userSchema = new mongoose.Schema({
  phone: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  fundPassword: {
    type: String,
    default: "",
  },
  invitationCode: String,

  taskExpireAt: {
    type: Date,
  },
earnings: {
    today: { type: Number, default: 0 },
    yesterday: { type: Number, default: 0 },
    week: { type: Number, default: 0 },
    month: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
  },
  taskInfo: {
    count: { type: Number, default: 0 },
    lastReset: { type: Date, default: Date.now }
  }


}, { timestamps: true });
const User = mongoose.model("User", userSchema);

// REGISTER ost data
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

    // ✅ 4 days later
    const expireDate = new Date();
    // expireDate.setMinutes(expireDate.getMinutes() + 5); 
    expireDate.setDate(expireDate.getDate() + 4); //now we can check it change time

    await User.create({
      phone,
      password: hash,
      invitationCode,
      taskExpireAt: expireDate
    });

    res.json({ message: "Register success ✅" });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// LOGIN post data
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

//user can update his password from his profile
app.post("/api/update-password", authMiddleware, async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  const user = await User.findById(req.userId);

  const isMatch = await bcrypt.compare(oldPassword, user.password);

  if (!isMatch) {
    return res.status(400).json({ message: "Old password wrong ❌" });
  }

  const hash = await bcrypt.hash(newPassword, 10);
  user.password = hash;

  await user.save();

  res.json({ message: "Password updated ✅" });
});

//user can update his fund pass from his profile
app.post("/api/update-fund-password", authMiddleware, async (req, res) => {
  const { newPassword } = req.body;

  const user = await User.findById(req.userId);

  const hash = await bcrypt.hash(newPassword, 10);
  user.fundPassword = hash;

  await user.save();

  res.json({ message: "Fund password updated ✅" });
});

// user inofrmation get
app.get("/api/user", authMiddleware, async (req, res) => {
  const user = await User.findById(req.userId).select("-password");

  res.json(user);
});



//-------------------- Task area started and also Earning -----------------------------

//task are user will get 4 days free tast
app.get("/api/task-status", authMiddleware, async (req, res) => {
  const user = await User.findById(req.userId);

  const now = new Date();

  if (now > user.taskExpireAt) {
    return res.json({
      canDoTask: false,
      message: "your free limit is end please deposit for getting new task"
    });
  }

  res.json({
    canDoTask: true,
    expireAt: user.taskExpireAt
  });
});

//TASK COMPLETE API (if someone complite the task then it will update)
app.post("/api/do-task", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    const now = new Date();

    // ❌ expire check
    if (now > user.taskExpireAt) {
      return res.status(400).json({
        message: "your free limit is end"
      });
    }

    // 🔥 24 hour reset check
    const last = new Date(user.taskInfo.lastReset);
    const diffHours = (now - last) / (1000 * 60 * 60);

    if (diffHours >= 24) {
      user.taskInfo.count = 0;
      user.earnings.today = 0;
      user.taskInfo.lastReset = now;
    }

    // ❌ max 5 task
    if (user.taskInfo.count >= 5) {
      return res.status(400).json({
        message: "Daily limit finished (5 tasks)"
      });
    }

    // ✅ add task
    user.taskInfo.count += 1;

    user.earnings.today += 5;
    user.earnings.week += 5;
    user.earnings.month += 5;
    user.earnings.total += 5;

    await user.save();

    res.json({
      message: "Task completed",
      earnings: user.earnings,
      taskCount: user.taskInfo.count
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

//TASK COUNT. how many tast have complited , we will get this
app.get("/api/task-count", authMiddleware, async (req, res) => {
  const user = await User.findById(req.userId);

  const now = new Date();
  const last = new Date(user.taskInfo.lastReset);

  const diffHours = (now - last) / (1000 * 60 * 60);

  let count = user.taskInfo.count;

  // 🔄 auto reset
  if (diffHours >= 24) {
    count = 0;
  }

  res.json({ count });
});

//All earnign will show 
app.get("/api/earnings", authMiddleware, async (req, res) => {
  const user = await User.findById(req.userId);

  res.json(user.earnings);
});




//----------------------wwithdrow sistem started------------------

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
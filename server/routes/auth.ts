import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { db } from "../db";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";
import { generateToken, authMiddleware, AuthRequest } from "../middleware/auth";

const router = Router();

router.post("/signup", async (req: Request, res: Response) => {
  try {
    const { email, password, full_name } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }
    const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existing.length > 0) {
      return res.status(409).json({ message: "User already exists" });
    }
    const password_hash = await bcrypt.hash(password, 10);
    const [user] = await db.insert(users).values({ email, password_hash, full_name, role: "user" }).returning();
    const token = generateToken({ id: user.id, email: user.email, role: user.role || "user", full_name: user.full_name || undefined });
    res.cookie("token", token, { httpOnly: true, sameSite: "lax", maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.json({ id: user.id, email: user.email, role: user.role, full_name: user.full_name, token });
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});

router.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    const token = generateToken({ id: user.id, email: user.email, role: user.role || "user", full_name: user.full_name || undefined });
    res.cookie("token", token, { httpOnly: true, sameSite: "lax", maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.json({ id: user.id, email: user.email, role: user.role, full_name: user.full_name, token });
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});

router.get("/me", authMiddleware, (req: AuthRequest, res: Response) => {
  res.json(req.user);
});

router.post("/logout", (req: Request, res: Response) => {
  res.clearCookie("token");
  res.json({ success: true });
});

export default router;

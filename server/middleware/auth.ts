import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "caremetric-dev-secret-change-in-production";

export interface AuthRequest extends Request {
  user?: { id: number; email: string; role: string; full_name?: string };
}

export function generateToken(user: { id: number; email: string; role: string; full_name?: string }) {
  return jwt.sign(user, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string) {
  return jwt.verify(token, JWT_SECRET) as { id: number; email: string; role: string; full_name?: string };
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.cookies?.token || req.headers.authorization?.replace("Bearer ", "");
  if (!token) {
    return res.status(401).json({ message: "Authentication required", detail: "You must be logged in to perform this operation." });
  }
  try {
    req.user = verifyToken(token);
    next();
  } catch (e) {
    return res.status(401).json({ message: "Invalid or expired token", detail: "Please log in again." });
  }
}

export function optionalAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.cookies?.token || req.headers.authorization?.replace("Bearer ", "");
  if (token) {
    try {
      req.user = verifyToken(token);
    } catch (e) {}
  }
  next();
}

export function adminOnly(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ message: "Forbidden", detail: "Admin access required." });
  }
  next();
}

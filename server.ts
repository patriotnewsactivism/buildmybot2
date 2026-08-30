import express from "express";
import cookieParser from "cookie-parser";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Type-only imports — erased by tsx at runtime
import type { VercelRequest, VercelResponse } from "@vercel/node";

// Import API handlers (tsx resolves .js -> .ts automatically)
import gatewayHandler from "./api/gateway.js";
import loginHandler from "./api/auth/login.js";
import signupHandler from "./api/auth/signup.js";
import logoutHandler from "./api/auth/logout.js";
import userHandler from "./api/auth/user.js";
import cronHandler from "./api/cron/[job].js";
import stripeWebhookHandler from "./api/stripe-webhook.js";

const app = express();
const PORT = process.env.PORT || 8080;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Stripe webhook needs raw body for signature verification
app.post(
  "/api/stripe-webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    try {
      (req as any).body = JSON.parse(req.body.toString());
    } catch {
      (req as any).body = {};
    }
    await stripeWebhookHandler(req as any, res as any);
  },
);

// Body parsing for all other routes
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());

// Lightweight production health/provenance endpoint used by Cloud Run deploy verification.
app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "buildmybot2",
    build: { sha: process.env.BUILD_SHA || "unknown" },
  });
});

// Auth routes — file-system routing equivalents from Vercel
app.all("/api/auth/login", async (req, res) => {
  await loginHandler(req as any, res as any);
});
app.all("/api/auth/signup", async (req, res) => {
  await signupHandler(req as any, res as any);
});
app.all("/api/auth/logout", async (req, res) => {
  await logoutHandler(req as any, res as any);
});
app.all("/api/auth/user", async (req, res) => {
  await userHandler(req as any, res as any);
});

// Cron routes — Vercel dynamic route [job] -> Express :job param
app.all("/api/cron/:job", async (req, res) => {
  (req as any).query = { ...req.query, job: req.params.job };
  await cronHandler(req as any, res as any);
});

// Gateway handles everything else under /api/*
app.all("/api/*", async (req, res) => {
  await gatewayHandler(req as any, res as any);
});

// Static frontend (built by Vite)
app.use(express.static(path.join(__dirname, "dist")));

// SPA fallback — serve index.html for non-API routes
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

app.listen(PORT, () => {
  console.log(`BuildMyBot server running on port ${PORT}`);
});

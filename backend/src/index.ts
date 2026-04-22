import express from "express";
import { errorMiddleware } from "./middleware/error.middleware";
import { AppError } from "./utils/AppError";

const app = express();

// Middleware
app.use(express.json());

// Routes
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Example route that throws AppError
app.get("/test-error", (_req, res, next) => {
  const error = new AppError(404, "Resource not found", { resource: "user" });
  next(error);
});

// Example route with unhandled error
app.get("/test-unhandled", (_req, res) => {
  throw new Error("Unexpected error occurred");
});

// Example route with validation error
app.post("/api/users", (req, res, next) => {
  if (!req.body.email) {
    const error = new AppError(400, "Validation error", {
      field: "email",
      reason: "Email is required",
    });
    return next(error);
  }
  res.json({ success: true });
});

// 404 handler - must be before error middleware
app.use((_req, _res, next) => {
  next(new AppError(404, "Route not found"));
});

// Error handler - must be LAST
app.use(errorMiddleware);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;

import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import swaggerUi from "swagger-ui-express";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import activityLogRoutes from "./routes/activityLogRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import beneficiaryAssignmentRoutes from "./routes/beneficiaryAssignmentRoutes.js";
import beneficiaryRoutes from "./routes/beneficiaryRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import fieldCheckInRoutes from "./routes/fieldCheckInRoutes.js";
import metaRoutes from "./routes/metaRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import programAssignmentRoutes from "./routes/programAssignmentRoutes.js";
import programRoutes from "./routes/programRoutes.js";
import replacementRoutes from "./routes/replacementRoutes.js";
import roleRoutes from "./routes/roleRoutes.js";
import tenantRoutes from "./routes/tenantRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import { sendResponse } from "./utils/apiResponse.js";
import { openApiSpec } from "./utils/swagger.js";

export function createApp() {
  const app = express();

  // Mounted before helmet so its default CSP doesn't block Swagger UI's inline assets.
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(openApiSpec));

  app.use(helmet());
  app.use(cors());
  app.use(morgan("dev"));
  app.use(express.json());
  app.use(cookieParser());

  app.get("/health", (_req, res) => {
    sendResponse(res, 200, "Service is healthy", { status: "ok" });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api/roles", roleRoutes);
  app.use("/api/tenants", tenantRoutes);
  app.use("/api/programs", programRoutes);
  app.use("/api/beneficiaries", beneficiaryRoutes);
  app.use("/api/program-assignments", programAssignmentRoutes);
  app.use("/api/beneficiary-assignments", beneficiaryAssignmentRoutes);
  app.use("/api/replacement-requests", replacementRoutes);
  app.use("/api/field-checkins", fieldCheckInRoutes);
  app.use("/api/activity-logs", activityLogRoutes);
  app.use("/api/notifications", notificationRoutes);
  app.use("/api/dashboard", dashboardRoutes);
  app.use("/api/meta", metaRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

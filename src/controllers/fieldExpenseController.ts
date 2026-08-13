import type { Request, Response } from "express";
import { requireTenantId } from "../middleware/auth.js";
import { ApiError } from "../middleware/errorHandler.js";
import { sendResponse } from "../utils/apiResponse.js";
import { prisma } from "../utils/prisma.js";
import { createFieldExpenseSchema, reviewFieldExpenseSchema } from "../utils/validators.js";
import { recordActivity } from "../utils/activityLog.js";
import { notifyUser } from "../utils/notifications.js";

const userBrief = { select: { id: true, name: true, email: true, telephone: true } } as const;
const programBrief = { select: { id: true, name: true } } as const;

const expenseInclude = {
  user: userBrief,
  program: programBrief,
  reviewedBy: userBrief,
} as const;

function idParam(req: Request): string {
  return req.params.id as string;
}

/**
 * POST /field-expenses — self-service, scoped to the caller (same
 * convention as field-checkins / availability-checks: no admin permission
 * gate). One multipart request: program + description + amount + date
 * fields alongside the supporting document file.
 */
export async function createFieldExpense(req: Request, res: Response): Promise<void> {
  const data = createFieldExpenseSchema.parse(req.body);
  const tenantId = requireTenantId(req);
  const userId = req.user!.sub;

  const program = await prisma.program.findFirst({ where: { id: data.programId, tenantId }, select: { id: true, name: true } });
  if (!program) throw new ApiError(400, "programId does not belong to your tenant");

  const file = (req as Request & { file?: Express.Multer.File }).file;
  if (!file) throw new ApiError(400, "Upload a supporting document");
  const documentUrl = `/uploads/expenses/${file.filename}`;

  const expense = await prisma.fieldExpense.create({
    data: {
      tenantId,
      userId,
      programId: data.programId,
      description: data.description,
      amount: data.amount,
      expenseDate: data.expenseDate,
      documentUrl,
    },
    include: expenseInclude,
  });

  await recordActivity({
    tenantId,
    userId,
    action: "submitted an expense for",
    entityType: "Program",
    entityId: program.id,
    metadata: { program: program.name, amount: data.amount, description: data.description },
  });

  sendResponse(res, 201, "Expense submitted successfully", expense);
}

/** GET /field-expenses/mine — self-service, the caller's own submissions. */
export async function listMyFieldExpenses(req: Request, res: Response): Promise<void> {
  const expenses = await prisma.fieldExpense.findMany({
    where: { userId: req.user!.sub },
    include: expenseInclude,
    orderBy: { createdAt: "desc" },
  });
  sendResponse(res, 200, "Your expenses retrieved successfully", expenses);
}

/** GET /field-expenses — admin, tenant-scoped, filterable. */
export async function listFieldExpenses(req: Request, res: Response): Promise<void> {
  const tenantId = requireTenantId(req);
  const { programId, userId, status } = req.query;

  const expenses = await prisma.fieldExpense.findMany({
    where: {
      tenantId,
      ...(typeof programId === "string" && programId ? { programId } : {}),
      ...(typeof userId === "string" && userId ? { userId } : {}),
      ...(status === "PENDING" || status === "APPROVED" || status === "REJECTED" ? { status } : {}),
    },
    include: expenseInclude,
    orderBy: { createdAt: "desc" },
  });
  sendResponse(res, 200, "Expenses retrieved successfully", expenses);
}

/** GET /field-expenses/:id — admin, single expense with document/review detail. */
export async function getFieldExpense(req: Request, res: Response): Promise<void> {
  const tenantId = requireTenantId(req);
  const expense = await prisma.fieldExpense.findFirst({ where: { id: idParam(req), tenantId }, include: expenseInclude });
  if (!expense) throw new ApiError(404, "Expense not found");
  sendResponse(res, 200, "Expense retrieved successfully", expense);
}

/** PUT /field-expenses/:id/review — admin approves or rejects a submission. */
export async function reviewFieldExpense(req: Request, res: Response): Promise<void> {
  const data = reviewFieldExpenseSchema.parse(req.body);
  const tenantId = requireTenantId(req);

  const existing = await prisma.fieldExpense.findFirst({ where: { id: idParam(req), tenantId } });
  if (!existing) throw new ApiError(404, "Expense not found");
  if (existing.status !== "PENDING") throw new ApiError(422, "This expense has already been reviewed");

  const expense = await prisma.fieldExpense.update({
    where: { id: existing.id },
    data: {
      status: data.status,
      reviewNotes: data.reviewNotes,
      reviewedById: req.user!.sub,
      reviewedAt: new Date(),
    },
    include: expenseInclude,
  });

  await recordActivity({
    tenantId,
    userId: req.user!.sub,
    action: `${data.status === "APPROVED" ? "approved" : "rejected"} the expense`,
    entityType: "FieldExpense",
    entityId: expense.id,
    metadata: { description: expense.description, amount: expense.amount, submitter: expense.user.name ?? expense.user.email },
  });

  await notifyUser({
    tenantId,
    userId: expense.userId,
    type: "EXPENSE_REVIEWED",
    message: `Your expense "${expense.description}" was ${data.status === "APPROVED" ? "approved" : "rejected"}`,
    entityType: "FieldExpense",
    entityId: expense.id,
  });

  sendResponse(res, 200, "Expense reviewed successfully", expense);
}

/** DELETE /field-expenses/:id — admin cleanup. */
export async function deleteFieldExpense(req: Request, res: Response): Promise<void> {
  const tenantId = requireTenantId(req);
  const existing = await prisma.fieldExpense.findFirst({ where: { id: idParam(req), tenantId } });
  if (!existing) throw new ApiError(404, "Expense not found");
  await prisma.fieldExpense.delete({ where: { id: existing.id } });
  sendResponse(res, 200, "Expense deleted successfully", null);
}

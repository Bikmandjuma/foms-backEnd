import { z } from "zod";

export const genderSchema = z.enum(["MALE", "FEMALE", "OTHER"]);
export const userStatusSchema = z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]);
export const educationLevelSchema = z.enum([
  "NONE",
  "PRIMARY",
  "SECONDARY",
  "BACHELORS",
  "MASTERS",
  "DOCTORATE",
]);

export const createRoleSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  permissions: z.array(z.string()).optional(),
});

export const updateRoleSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  permissions: z.array(z.string()).optional(),
});

const userProfileFields = {
  name: z.string().optional(),
  telephone: z.string().optional(),
  province: z.string().optional(),
  district: z.string().optional(),
  sector: z.string().optional(),
  gender: genderSchema.optional(),
  dateOfBirth: z.coerce.date().optional(),
  status: userStatusSchema.optional(),
  educationLevel: educationLevelSchema.optional(),
};

export const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  roleId: z.string().uuid(),
  ...userProfileFields,
});

export const updateUserSchema = z.object({
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
  roleId: z.string().uuid().optional(),
  ...userProfileFields,
});

const tenantAdminSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  ...userProfileFields,
});

export const createTenantSchema = z.object({
  name: z.string().min(1),
  admin: tenantAdminSchema,
});

export const updateTenantSchema = z.object({
  name: z.string().min(1).optional(),
});

export const scenarioTypeSchema = z.enum([
  "BASELINE_SURVEY",
  "ENDLINE_SURVEY",
  "TRACER_STUDY",
  "PROGRAM_OUTCOME_ASSESSMENT",
  "QUALITATIVE_STUDY",
]);
export const projectStatusSchema = z.enum(["PLANNING", "FIELDWORK", "DATA_CLEANING", "REPORTING", "COMPLETED"]);
export const responseOutcomeSchema = z.enum([
  "PENDING",
  "COMPLETED",
  "REFUSED",
  "NOT_FOUND",
  "RELOCATED",
  "DECEASED",
  "REPLACED",
]);

export const createProgramSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  scenarioType: scenarioTypeSchema.optional(),
  status: projectStatusSchema.optional(),
  targetSampleSize: z.number().int().nonnegative().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export const updateProgramSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  scenarioType: scenarioTypeSchema.optional(),
  status: projectStatusSchema.optional(),
  targetSampleSize: z.number().int().nonnegative().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export const createBeneficiarySchema = z.object({
  name: z.string().min(1),
  telephone: z.string().optional(),
  province: z.string().optional(),
  district: z.string().optional(),
  sector: z.string().optional(),
  gender: genderSchema.optional(),
  dateOfBirth: z.coerce.date().optional(),
  status: userStatusSchema.optional(),
  nationalId: z.string().optional(),
  householdSize: z.number().int().nonnegative().optional(),
  programIds: z.array(z.string().uuid()).optional(),
  consentGiven: z.boolean().optional(),
  consentAt: z.coerce.date().optional(),
  outcome: responseOutcomeSchema.optional(),
});

export const updateBeneficiarySchema = z.object({
  name: z.string().min(1).optional(),
  telephone: z.string().optional(),
  province: z.string().optional(),
  district: z.string().optional(),
  sector: z.string().optional(),
  gender: genderSchema.optional(),
  dateOfBirth: z.coerce.date().optional(),
  status: userStatusSchema.optional(),
  nationalId: z.string().optional(),
  householdSize: z.number().int().nonnegative().optional(),
  programIds: z.array(z.string().uuid()).optional(),
  consentGiven: z.boolean().optional(),
  consentAt: z.coerce.date().optional(),
  outcome: responseOutcomeSchema.optional(),
});

export const createProgramAssignmentSchema = z.object({
  userId: z.string().uuid(),
  programId: z.string().uuid(),
});

export const createBeneficiaryAssignmentSchema = z.object({
  beneficiaryId: z.string().uuid(),
  userId: z.string().uuid(),
});

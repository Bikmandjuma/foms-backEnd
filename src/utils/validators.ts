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
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  telephone: z.string().optional(),
  provinceId: z.number().int().optional(),
  districtId: z.number().int().optional(),
  sectorId: z.number().int().optional(),
  cellId: z.number().int().optional(),
  villageId: z.number().int().optional(),
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
  tracingRequired: z.boolean().optional(),
});

export const updateProgramSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  scenarioType: scenarioTypeSchema.optional(),
  status: projectStatusSchema.optional(),
  targetSampleSize: z.number().int().nonnegative().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  tracingRequired: z.boolean().optional(),
});

export const createBeneficiarySchema = z.object({
  name: z.string().min(1),
  telephone: z.string().optional(),
  provinceId: z.number().int().optional(),
  districtId: z.number().int().optional(),
  sectorId: z.number().int().optional(),
  cellId: z.number().int().optional(),
  villageId: z.number().int().optional(),
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
  provinceId: z.number().int().optional(),
  districtId: z.number().int().optional(),
  sectorId: z.number().int().optional(),
  cellId: z.number().int().optional(),
  villageId: z.number().int().optional(),
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

// Assign many users to one program in a single action ("add option of
// select/check more than one users to be assigned on certain program").
export const bulkProgramAssignmentSchema = z.object({
  programId: z.string().uuid(),
  userIds: z.array(z.string().uuid()).min(1),
});

// The Smart Assignment Engine, per spec: choose a program (its enumerators
// are auto-detected from ProgramAssignment, never picked manually here),
// choose one or more vehicles, click Random Top-Up. That's the whole input.
export const autoAssignBeneficiariesSchema = z.object({
  programId: z.string().uuid(),
  vehicleIds: z.array(z.string().uuid()).min(1, "Select at least one vehicle"),
});

export const updateProgramTeamConfigSchema = z.object({
  programId: z.string().uuid(),
  teamLeaderRoleId: z.string().uuid(),
  teamMemberRoleId: z.string().uuid(),
  membersPerTeam: z.number().int().min(1).max(500),
});

export const setProgramTeamLeaderSchema = z.object({
  userId: z.string().uuid(),
});

export const addProgramTeamMemberSchema = z.object({
  userId: z.string().uuid(),
});

export const addProgramTeamVehicleSchema = z.object({
  vehicleId: z.string().uuid(),
});

// "Confirm availability" — an independent, saved-per-program configuration
// (which role does the checking) separate from the geo-assignment engine.
export const updateAvailabilityCheckConfigSchema = z.object({
  programId: z.string().uuid(),
  checkerRoleId: z.string().uuid(),
});

export const assignAvailabilityChecksSchema = z.object({
  programId: z.string().uuid(),
});

// The checker's own submit — PENDING is the default-only "not checked yet"
// state and is never a choice here.
export const submitAvailabilityCheckSchema = z.object({
  status: z.enum(["AVAILABLE", "REFUSED", "NOT_FOUND", "RELOCATED", "DECEASED"]),
  notes: z.string().optional(),
  // Set together (from the "confirm/set new location" prompt on AVAILABLE)
  // when the checker found the respondent somewhere new.
  provinceId: z.number().int().optional(),
  districtId: z.number().int().optional(),
  sectorId: z.number().int().optional(),
  cellId: z.number().int().optional(),
  villageId: z.number().int().optional(),
});

export const programTeamProgramIdSchema = z.object({
  programId: z.string().uuid(),
});

// How respondents get enrolled onto a program: everyone eligible, a
// hand-picked list, or a random subset of a given size (validated against
// the eligible pool size in the controller, since that's DB-dependent).
export const assignRespondentsToProgramSchema = z.object({
  programId: z.string().uuid(),
  mode: z.enum(["ALL", "SPECIFIC", "RANDOM"]),
  beneficiaryIds: z.array(z.string().uuid()).optional(),
  count: z.number().int().positive().optional(),
});

// Multipart submit (fields + a document file) — text fields arrive as
// strings, hence the coercion. The category picked first decides the rest
// of the shape: TRANSPORT has no program but adds receipt/rider/route
// fields; OTHER keeps the original program+description shape.
export const createFieldExpenseSchema = z.discriminatedUnion("category", [
  z.object({
    category: z.literal("TRANSPORT"),
    receiptNo: z.string().min(1),
    riderName: z.string().min(1),
    riderPhone: z.string().min(1),
    routeFrom: z.string().min(1),
    routeTo: z.string().min(1),
    description: z.string().min(1), // purpose of travel
    amount: z.coerce.number().positive(),
    expenseDate: z.coerce.date(),
  }),
  z.object({
    category: z.literal("OTHER"),
    programId: z.string().uuid(),
    description: z.string().min(1),
    amount: z.coerce.number().positive(),
    expenseDate: z.coerce.date(),
  }),
]);

export const reviewFieldExpenseSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  reviewNotes: z.string().optional(),
});

export const createVehicleSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["VEHICLE", "MOTORCYCLE"]).default("VEHICLE"),
  driverName: z.string().optional(),
  capacityPerDay: z.number().int().positive().optional(),
  active: z.boolean().default(true),
});

export const updateVehicleSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.enum(["VEHICLE", "MOTORCYCLE"]).optional(),
  driverName: z.string().optional(),
  capacityPerDay: z.number().int().positive().nullable().optional(),
  active: z.boolean().optional(),
});

// Replacement decision v2 — approving outside the geographic hierarchy
// requires a recorded reason (PRD: "an administrator override this rule
// with a recorded justification").
export const decideReplacementSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  candidateRespondentId: z.string().uuid().optional(),
  overrideReason: z.string().optional(),
});

export const recordFieldVisitSchema = z.object({
  outcome: responseOutcomeSchema,
  note: z.string().optional(),
  // Required only when outcome is COMPLETED or REFUSED — enforced in the
  // controller (see OTP_REQUIRED_OUTCOMES), not here, since that check
  // needs to run against stored FieldVisitOtp rows.
  otpCode: z.string().length(6).optional(),
});

// The supervisor's review of a recorded outcome — CONFIRMED or REJECTED,
// PENDING is the default-only "not reviewed yet" state and never a choice
// here (mirrors submitAvailabilityCheckSchema/reviewFieldExpenseSchema).
export const confirmFieldVisitOutcomeSchema = z.object({
  status: z.enum(["CONFIRMED", "REJECTED"]),
  reason: z.string().optional(),
});

export const checkoutSchema = z.object({
  overrideReason: z.string().optional(),
});

export const addFieldNoteSchema = z.object({
  note: z.string().min(1),
});

export const currentGpsSchema = z.object({
  gpsLat: z.number(),
  gpsLng: z.number(),
  note: z.string().optional(),
});

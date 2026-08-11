import fs from "fs";
import multer from "multer";
import path from "path";

const EXPENSE_DIR = path.join(process.cwd(), "uploads", "expenses");
fs.mkdirSync(EXPENSE_DIR, { recursive: true });

// Disk storage, same shape as uploadAvatar — served back out via
// /uploads/expenses/<filename>. Supporting documents are receipts, so
// images or PDFs.
export const uploadExpenseDocument = multer({
  storage: multer.diskStorage({
    destination: EXPENSE_DIR,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
      const userId = (req as any).user?.sub ?? "anon";
      cb(null, `${userId}-${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const okTypes = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];
    if (okTypes.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only JPEG, PNG, WEBP, GIF images or PDF documents are supported"));
  },
});

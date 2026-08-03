import multer from "multer";

// In-memory storage — files are small (spreadsheets), parsed immediately,
// and never need to touch disk. 10MB is generous for a beneficiary list.
export const uploadExcel = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const okTypes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
    ];
    if (okTypes.includes(file.mimetype) || file.originalname.toLowerCase().endsWith(".xlsx")) {
      cb(null, true);
    } else {
      cb(new Error("Only .xlsx files are supported"));
    }
  },
});

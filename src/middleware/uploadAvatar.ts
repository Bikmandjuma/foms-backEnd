import fs from "fs";
import multer from "multer";
import path from "path";

const AVATAR_DIR = path.join(process.cwd(), "uploads", "avatars");
fs.mkdirSync(AVATAR_DIR, { recursive: true });

// Disk storage (unlike uploadExcel's in-memory one) — avatars are served
// back out via /uploads/avatars/<filename>, so they need to actually live
// on disk. Filename is randomized to avoid collisions/overwrites.
export const uploadAvatar = multer({
  storage: multer.diskStorage({
    destination: AVATAR_DIR,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
      const userId = (req as any).user?.sub ?? "anon";
      cb(null, `${userId}-${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const okTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (okTypes.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only JPEG, PNG, WEBP, or GIF images are supported"));
  },
});

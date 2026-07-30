import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const envPath = new URL("../.env", import.meta.url);
const secret = randomBytes(64).toString("hex");

if (!existsSync(envPath)) {
  writeFileSync(envPath, `JWT_SECRET="${secret}"\n`);
  console.log("Created .env with a new JWT_SECRET");
} else {
  const contents = readFileSync(envPath, "utf8");
  const line = `JWT_SECRET="${secret}"`;
  const updated = /^JWT_SECRET=.*$/m.test(contents)
    ? contents.replace(/^JWT_SECRET=.*$/m, line)
    : `${contents.replace(/\n?$/, "\n")}${line}\n`;

  writeFileSync(envPath, updated);
  console.log("JWT_SECRET set in .env");
}

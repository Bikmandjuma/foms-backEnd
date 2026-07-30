import { readFileSync } from "node:fs";
import path from "node:path";
import { load } from "js-yaml";
import type { JsonObject } from "swagger-ui-express";

const specPath = path.join(process.cwd(), "docs", "openapi.yaml");

export const openApiSpec = load(readFileSync(specPath, "utf8")) as JsonObject;

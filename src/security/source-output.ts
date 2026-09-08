import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { getExecutionPolicy } from "./execution-policy.js";
import { writeDiagnosisArtifact } from "../app-quality/persistence.js";

export async function assertSourceOutput(path: string): Promise<void> {
  const policy = getExecutionPolicy();
  policy.assert("source-content-persistence", "persist source-bearing artifacts");
  await policy.assertProjectWrite(path, "write source-bearing artifacts");
}

/** Directory checks precede creation; source bytes use the validated file descriptor. */
export async function writeSourceArtifact(path: string, content: string): Promise<void> {
  await assertSourceOutput(path);
  await mkdir(dirname(path), { recursive: true });
  await writeDiagnosisArtifact(path, content);
}

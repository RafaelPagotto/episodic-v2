import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("operator demo bootstrap", () => {
  it("checks server imports and shows help without loading credentials or writing metadata", () => {
    const args = ["--conditions=react-server", "--import", "tsx", "scripts/bootstrap-demo.ts"];
    const options = { cwd: process.cwd(), encoding: "utf8" as const, timeout: 10000 };
    expect(execFileSync(process.execPath, [...args, "--check"], options)).toContain("No environment loaded or requests made.");
    expect(execFileSync(process.execPath, args, options)).toContain("--confirm-shared-metadata-write");
  });
});

import { describe, expect, it } from "vitest";

import {
  readFormString,
  validateDisplayName,
  validateEmail,
  validateNewPassword,
  validateRequiredPassword,
} from "../features/auth/validation";

describe("auth validation", () => {
  it("trims text fields by default but can preserve password spacing", () => {
    const formData = new FormData();
    formData.set("email", "  user@example.com  ");
    formData.set("password", "  pass phrase  ");

    expect(readFormString(formData, "email")).toBe("user@example.com");
    expect(readFormString(formData, "password", { trim: false })).toBe("  pass phrase  ");
  });

  it("validates required auth fields", () => {
    expect(validateDisplayName("")).toBe("Name is required.");
    expect(validateEmail("not-an-email")).toBe("Enter a valid email address.");
    expect(validateRequiredPassword("")).toBe("Password is required.");
  });

  it("requires sufficiently strong new passwords", () => {
    expect(validateNewPassword("Short1")).toBe("Use at least 10 characters.");
    expect(validateNewPassword("longpassword")).toBe("Use upper case, lower case, and a number.");
    expect(validateNewPassword("Longpassword1")).toBeNull();
  });
});

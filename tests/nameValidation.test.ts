import { describe, it, expect } from "vitest";
import { validateUserName } from "../src/lib/validation/name";

describe("User Name Validation Suite", () => {
  describe("Minimum Character Length (min 2 characters)", () => {
    it("rejects empty names", () => {
      expect(validateUserName("")).toEqual({
        valid: false,
        error: "Name must be at least 2 characters",
      });
      expect(validateUserName("   ")).toEqual({
        valid: false,
        error: "Name must be at least 2 characters",
      });
    });

    it("rejects single character names", () => {
      expect(validateUserName("a")).toEqual({
        valid: false,
        error: "Name must be at least 2 characters",
      });
      expect(validateUserName(" A ")).toEqual({
        valid: false,
        error: "Name must be at least 2 characters",
      });
      expect(validateUserName("7")).toEqual({
        valid: false,
        error: "Name must be at least 2 characters",
      });
    });

    it("accepts names with exactly 2 characters", () => {
      const res = validateUserName("Jo");
      expect(res.valid).toBe(true);
      expect(res.cleanName).toBe("Jo");
    });
  });

  describe("Special Characters Restriction", () => {
    it("rejects strings made purely of special symbols like in the user report", () => {
      const symbols = ["@#$%^&*", "!@#$", "^_^", "<script>", "admin*"];
      symbols.forEach((sym) => {
        const res = validateUserName(sym);
        expect(res.valid).toBe(false);
        expect(res.error).toBe("Name cannot contain special characters");
      });
    });

    it("rejects names with embedded special characters", () => {
      const mixed = [
        "John@Doe",
        "Alice #1",
        "Bob/Smith",
        "Test!",
        "User_Name",
        "Company&Co",
        "Robert; DROP TABLE",
        "Hello <World>",
      ];
      mixed.forEach((name) => {
        const res = validateUserName(name);
        expect(res.valid).toBe(false);
        expect(res.error).toBe("Name cannot contain special characters");
      });
    });
  });

  describe("Valid Names", () => {
    it("accepts valid alphabetic names and names with spaces", () => {
      const validNames = [
        "Lycoris",
        "John Doe",
        "Mary Jane Watson",
        "Alexander the Great",
      ];
      validNames.forEach((name) => {
        const res = validateUserName(name);
        expect(res.valid).toBe(true);
        expect(res.cleanName).toBe(name);
      });
    });

    it("accepts alphanumeric names with numbers and spaces", () => {
      const res = validateUserName("Studio 54");
      expect(res.valid).toBe(true);
      expect(res.cleanName).toBe("Studio 54");
    });

    it("trims leading and trailing whitespace cleanly", () => {
      const res = validateUserName("   Lycoris Admin   ");
      expect(res.valid).toBe(true);
      expect(res.cleanName).toBe("Lycoris Admin");
    });
  });

  describe("Type safety and boundary conditions", () => {
    it("rejects non-string inputs", () => {
      expect(validateUserName(null)).toEqual({
        valid: false,
        error: "Name is required",
      });
      expect(validateUserName(undefined)).toEqual({
        valid: false,
        error: "Name is required",
      });
      expect(validateUserName(12345)).toEqual({
        valid: false,
        error: "Name is required",
      });
    });

    it("rejects names exceeding 100 characters", () => {
      const longName = "A".repeat(101);
      expect(validateUserName(longName)).toEqual({
        valid: false,
        error: "Name cannot exceed 100 characters",
      });
    });
  });
});

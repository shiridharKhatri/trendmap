/**
 * User name validation utility.
 * - Minimum 2 characters (trimmed)
 * - Max 100 characters
 * - No special characters (letters, numbers, and spaces only)
 */
export function validateUserName(name: unknown): {
  valid: boolean;
  error?: string;
  cleanName?: string;
} {
  if (typeof name !== "string") {
    return { valid: false, error: "Name is required" };
  }

  const trimmed = name.trim();
  if (trimmed.length < 2) {
    return { valid: false, error: "Name must be at least 2 characters" };
  }

  if (trimmed.length > 100) {
    return { valid: false, error: "Name cannot exceed 100 characters" };
  }

  // Disallow special characters (only letters, numbers, and spaces allowed)
  const nameRegex = /^[a-zA-Z0-9\s]+$/;
  if (!nameRegex.test(trimmed)) {
    return { valid: false, error: "Name cannot contain special characters" };
  }

  return { valid: true, cleanName: trimmed };
}

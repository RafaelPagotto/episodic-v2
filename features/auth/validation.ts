const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN_LENGTH = 10;

type ReadFormStringOptions = {
  trim?: boolean;
};

export function readFormString(
  formData: FormData,
  key: string,
  { trim = true }: ReadFormStringOptions = {},
) {
  const value = formData.get(key);
  if (typeof value !== "string") return "";
  return trim ? value.trim() : value;
}

export function validateEmail(email: string) {
  if (!email) return "Email is required.";
  if (!EMAIL_PATTERN.test(email)) return "Enter a valid email address.";
  return null;
}

export function validateRequiredPassword(password: string) {
  if (!password) return "Password is required.";
  return null;
}

export function validateNewPassword(password: string) {
  if (!password) return "Password is required.";
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    return "Use upper case, lower case, and a number.";
  }
  return null;
}

export function validateDisplayName(name: string) {
  if (!name) return "Name is required.";
  if (name.length > 80) return "Name must be 80 characters or fewer.";
  return null;
}

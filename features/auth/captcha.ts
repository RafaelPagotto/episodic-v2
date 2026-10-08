export function readCaptchaToken(formData: FormData) {
  const token = formData.get("captchaToken");
  return typeof token === "string" && token.trim() ? token.trim() : undefined;
}

export function isCaptchaRequired() {
  return Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
}

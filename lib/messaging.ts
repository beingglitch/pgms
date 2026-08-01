export function waLink(phone: string | null | undefined, message: string) {
  const digits = (phone || "").replace(/\D/g, "");
  const withCountry = digits.length === 10 ? "91" + digits : digits;
  return `https://wa.me/${withCountry}?text=${encodeURIComponent(message)}`;
}

export function mailtoLink(email: string | null | undefined, subject: string, message: string) {
  const params = new URLSearchParams({ subject, body: message });
  return `mailto:${email || ""}?${params.toString()}`;
}

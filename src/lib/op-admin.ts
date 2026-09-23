/** Persönliche OP-Admin-Rechte — nur dieser Account sieht die Einstellungen. */
export const OP_ADMIN_EMAIL = "ben.richardson@whu.edu";

export function istOpAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === OP_ADMIN_EMAIL;
}

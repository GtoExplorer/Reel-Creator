import { SignJWT } from "jose";

// Mints a gtoc_session cookie value compatible with the webapp's lib/session.ts
// (HS256, signed with SESSION_SECRET). Lets the headless browser land on
// /explorer already authenticated, without driving the login form or Google.
export async function mintSession(email: string, secret: string): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new SignJWT({ email, subActive: true, plans: ["beta"] })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(key);
}

import { afterEach, describe, expect, it, vi } from "vitest";

// a signed-in family member who isn't the admin
vi.mock("next-auth", () => ({
  default: () => ({ handlers: {}, auth: async () => ({ user: { email: "Family@Example.com" } }), signIn: vi.fn(), signOut: vi.fn() }),
}));
vi.mock("next-auth/providers/google", () => ({ default: {} }));

const { isAllowedEmail, isAdminEmail, requireUser, requireAdmin } = await import("@/lib/auth");

afterEach(() => {
  delete process.env.ALLOWED_EMAILS;
  delete process.env.ADMIN_EMAILS;
});

describe("allowlist and admin", () => {
  it("lets family sign in but keeps admin to ADMIN_EMAILS", async () => {
    process.env.ALLOWED_EMAILS = " admin@example.com, family@example.com ";
    process.env.ADMIN_EMAILS = "ADMIN@example.com";
    expect(isAllowedEmail("family@example.com")).toBe(true);
    expect(isAdminEmail("family@example.com")).toBe(false);
    expect(isAdminEmail("admin@example.com")).toBe(true);
    expect(await requireUser()).toMatchObject({ email: "Family@Example.com" });
    expect(await requireAdmin()).toBeNull();
  });

  it("an admin must also be allowed to sign in, and no ADMIN_EMAILS means no admin", () => {
    process.env.ADMIN_EMAILS = "admin@example.com";
    expect(isAdminEmail("admin@example.com")).toBe(false);
    process.env.ALLOWED_EMAILS = "admin@example.com";
    delete process.env.ADMIN_EMAILS;
    expect(isAdminEmail("admin@example.com")).toBe(false);
    expect(isAdminEmail(null)).toBe(false);
  });

  it("admin-only routes answer 403 to family members", async () => {
    process.env.ALLOWED_EMAILS = "admin@example.com,family@example.com";
    process.env.ADMIN_EMAILS = "admin@example.com";
    const { POST } = await import("@/app/api/flights/route");
    expect((await POST()).status).toBe(403);
  });
});

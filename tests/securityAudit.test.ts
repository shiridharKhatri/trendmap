import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { validateUrlForSSRF } from "../src/lib/security/ssrf";
import { hashPassword, verifyPassword, signToken, verifyToken } from "../src/lib/security/auth";
import { getAuthSecret, getCronSecret } from "../src/lib/security/env";

describe("Comprehensive Security Audit & Verification Suite", () => {
  const originalAuthSecret = process.env.AUTH_SECRET;
  const originalCronSecret = process.env.CRON_SECRET;

  beforeAll(() => {
    process.env.AUTH_SECRET = "test-cryptographic-secret-at-least-32-characters-long!";
    process.env.CRON_SECRET = "test-cron-security-token-98765";
  });

  afterAll(() => {
    process.env.AUTH_SECRET = originalAuthSecret;
    process.env.CRON_SECRET = originalCronSecret;
  });

  describe("1. SSRF (Server-Side Request Forgery) Defense", () => {
    it("blocks IPv4 loopback variations", async () => {
      expect((await validateUrlForSSRF("http://127.0.0.1/admin")).safe).toBe(false);
      expect((await validateUrlForSSRF("http://127.0.1.2/secret")).safe).toBe(false);
      expect((await validateUrlForSSRF("http://127.255.255.254/")).safe).toBe(false);
    });

    it("blocks IPv6 loopback and link-local addresses (standard and bracket notation)", async () => {
      expect((await validateUrlForSSRF("http://[::1]/")).safe).toBe(false);
      expect((await validateUrlForSSRF("http://[0:0:0:0:0:0:0:1]/")).safe).toBe(false);
      expect((await validateUrlForSSRF("http://[fe80::1]/")).safe).toBe(false);
    });

    it("blocks IPv4-mapped IPv6 loopbacks and private addresses", async () => {
      expect((await validateUrlForSSRF("http://[::ffff:127.0.0.1]/")).safe).toBe(false);
      expect((await validateUrlForSSRF("http://[::ffff:169.254.169.254]/")).safe).toBe(false);
      expect((await validateUrlForSSRF("http://[::ffff:10.0.0.1]/")).safe).toBe(false);
    });

    it("blocks cloud instance metadata service (AWS/GCP/Azure link-local)", async () => {
      const res = await validateUrlForSSRF("http://169.254.169.254/latest/meta-data/");
      expect(res.safe).toBe(false);
    });

    it("blocks RFC 1918 private IPv4 subnets", async () => {
      // 10.0.0.0/8
      expect((await validateUrlForSSRF("http://10.0.0.1/internal")).safe).toBe(false);
      expect((await validateUrlForSSRF("http://10.255.255.255/")).safe).toBe(false);

      // 172.16.0.0/12
      expect((await validateUrlForSSRF("http://172.16.0.1/")).safe).toBe(false);
      expect((await validateUrlForSSRF("http://172.31.255.255/")).safe).toBe(false);

      // 192.168.0.0/16
      expect((await validateUrlForSSRF("http://192.168.1.1/router")).safe).toBe(false);
      expect((await validateUrlForSSRF("http://192.168.100.50/")).safe).toBe(false);
    });

    it("blocks carrier-grade NAT subnet (100.64.0.0/10)", async () => {
      expect((await validateUrlForSSRF("http://100.64.0.1/")).safe).toBe(false);
      expect((await validateUrlForSSRF("http://100.127.255.255/")).safe).toBe(false);
    });

    it("blocks non-HTTP protocols and pseudo-schemes", async () => {
      expect((await validateUrlForSSRF("file:///etc/passwd")).safe).toBe(false);
      expect((await validateUrlForSSRF("ftp://10.0.0.1/file.xml")).safe).toBe(false);
      expect((await validateUrlForSSRF("gopher://127.0.0.1:70/")).safe).toBe(false);
      expect((await validateUrlForSSRF("javascript:alert(document.cookie)")).safe).toBe(false);
      expect((await validateUrlForSSRF("data:text/html,<script>alert(1)</script>")).safe).toBe(false);
    });

    it("blocks local and internal domain name suffixes", async () => {
      expect((await validateUrlForSSRF("http://localhost/api")).safe).toBe(false);
      expect((await validateUrlForSSRF("http://internal.db.local/")).safe).toBe(false);
      expect((await validateUrlForSSRF("http://kubernetes.default.svc.cluster.local/")).safe).toBe(false);
    });

    it("permits standard public domains", async () => {
      const res = await validateUrlForSSRF("https://example.com/sitemap.xml");
      expect(res.safe).toBe(true);
    });
  });

  describe("2. Authentication & Cryptographic Integrity", () => {
    it("hashes passwords securely with bcrypt", async () => {
      const password = "SuperSecretSecurePassword123!";
      const hash = await hashPassword(password);

      expect(hash).not.toBe(password);
      expect(hash.startsWith("$2a$") || hash.startsWith("$2b$")).toBe(true);

      const isValid = await verifyPassword(password, hash);
      expect(isValid).toBe(true);

      const isInvalid = await verifyPassword("WrongPassword123!", hash);
      expect(isInvalid).toBe(false);
    });

    it("signs and verifies JWT tokens with protected claims", async () => {
      const session = {
        userId: "user_sec_test_01",
        email: "secadmin@example.com",
        name: "Security Tester",
        role: "admin" as const,
      };

      const token = await signToken(session);
      expect(typeof token).toBe("string");
      expect(token.split(".").length).toBe(3);

      const verified = await verifyToken(token);
      expect(verified).not.toBeNull();
      expect(verified?.userId).toBe(session.userId);
      expect(verified?.email).toBe(session.email);
      expect(verified?.role).toBe(session.role);
    });

    it("rejects tampered or forged JWT tokens", async () => {
      const session = {
        userId: "user_sec_test_02",
        email: "normal@example.com",
        name: "Normal User",
        role: "user" as const,
      };

      const validToken = await signToken(session);
      const parts = validToken.split(".");

      // Tamper with payload by mutating characters
      const tamperedPayload = parts[1].substring(0, parts[1].length - 4) + "AAAA";
      const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

      const verified = await verifyToken(tamperedToken);
      expect(verified).toBeNull();

      // Completely bogus token
      expect(await verifyToken("completely.bogus.token")).toBeNull();
    });
  });

  describe("3. Environment Variable Security & Secrets Integrity", () => {
    it("retrieves valid binary secret for JWT signing", () => {
      const secret = getAuthSecret();
      expect(secret).toBeInstanceOf(Uint8Array);
      expect(secret.length).toBeGreaterThanOrEqual(32);
    });

    it("retrieves cron secret without empty string fallback", () => {
      const cronSecret = getCronSecret();
      expect(typeof cronSecret).toBe("string");
      expect(cronSecret.length).toBeGreaterThan(0);
    });

    it("strictly rejects AUTH_SECRET that is shorter than 32 characters", () => {
      process.env.AUTH_SECRET = "short-key-12345";
      expect(() => getAuthSecret()).toThrow(/at least 32 characters long/);
      process.env.AUTH_SECRET = "test-cryptographic-secret-at-least-32-characters-long!";
    });

    it("strictly rejects missing environment variables without insecure defaults", () => {
      delete process.env.AUTH_SECRET;
      expect(() => getAuthSecret()).toThrow(/is missing or empty/);
      process.env.AUTH_SECRET = "test-cryptographic-secret-at-least-32-characters-long!";
    });
  });
});

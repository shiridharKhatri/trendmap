import { describe, it, expect } from "vitest";
import { validateUrlForSSRF } from "../src/lib/security/ssrf";

describe("SSRF Security Guard", () => {
  it("blocks localhost and loopback IPv4 addresses", async () => {
    const res1 = await validateUrlForSSRF("http://localhost/secret");
    expect(res1.safe).toBe(false);

    const res2 = await validateUrlForSSRF("http://127.0.0.1/sitemap.xml");
    expect(res2.safe).toBe(false);

    const res3 = await validateUrlForSSRF("http://127.0.1.5/admin");
    expect(res3.safe).toBe(false);
  });

  it("blocks cloud metadata service IP (169.254.169.254)", async () => {
    const res = await validateUrlForSSRF("http://169.254.169.254/latest/meta-data/");
    expect(res.safe).toBe(false);
  });

  it("blocks private network subnets (10.x, 192.168.x, 172.16.x)", async () => {
    expect((await validateUrlForSSRF("http://10.0.0.1/sitemap.xml")).safe).toBe(false);
    expect((await validateUrlForSSRF("http://192.168.1.100/sitemap.xml")).safe).toBe(false);
    expect((await validateUrlForSSRF("http://172.20.1.1/sitemap.xml")).safe).toBe(false);
  });

  it("blocks non-HTTP protocols", async () => {
    expect((await validateUrlForSSRF("file:///etc/passwd")).safe).toBe(false);
    expect((await validateUrlForSSRF("ftp://ftp.example.com/sitemap.xml")).safe).toBe(false);
    expect((await validateUrlForSSRF("javascript:alert(1)")).safe).toBe(false);
    expect((await validateUrlForSSRF("gopher://example.com")).safe).toBe(false);
  });

  it("permits safe public domain names", async () => {
    const res = await validateUrlForSSRF("https://example.com/sitemap.xml");
    expect(res.safe).toBe(true);
  });
});

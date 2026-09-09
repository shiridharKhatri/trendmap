import dns from "dns/promises";
import net from "net";

/**
 * Checks whether an IPv4 address belongs to a private, loopback, or reserved range.
 */
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return true; // Malformed -> consider unsafe
  }

  const [a, b] = parts;

  // 0.0.0.0/8 (Current network)
  if (a === 0) return true;

  // 127.0.0.0/8 (Loopback)
  if (a === 127) return true;

  // 10.0.0.0/8 (Private)
  if (a === 10) return true;

  // 172.16.0.0/12 (Private)
  if (a === 172 && b >= 16 && b <= 31) return true;

  // 192.168.0.0/16 (Private)
  if (a === 192 && b === 168) return true;

  // 169.254.0.0/16 (Link-local & Cloud metadata e.g. AWS/GCP 169.254.169.254)
  if (a === 169 && b === 254) return true;

  // 100.64.0.0/10 (Carrier-grade NAT)
  if (a === 100 && b >= 64 && b <= 127) return true;

  // 192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24 (Documentation / TEST-NET)
  if (a === 192 && b === 0 && parts[2] === 2) return true;
  if (a === 198 && b === 51 && parts[2] === 100) return true;
  if (a === 203 && b === 0 && parts[2] === 113) return true;

  // 224.0.0.0/4 (Multicast) & 240.0.0.0/4 (Reserved)
  if (a >= 224) return true;

  return false;
}

/**
 * Checks whether an IPv6 address is loopback, unique local, or link-local.
 */
function isPrivateIPv6(ip: string): boolean {
  const clean = ip.toLowerCase();
  if (clean === "::1" || clean === "::") return true;
  if (clean.startsWith("fc") || clean.startsWith("fd")) return true; // Unique local
  if (clean.startsWith("fe80:")) return true; // Link local
  if (clean.startsWith("::ffff:")) {
    // IPv4 mapped
    const ipv4 = clean.replace("::ffff:", "");
    return isPrivateIPv4(ipv4);
  }
  return false;
}

export interface SSRFValidationResult {
  safe: boolean;
  reason?: string;
  resolvedIp?: string;
}

/**
 * Validates a target URL against SSRF and unauthorized network requests.
 * Only allows http and https protocols, and resolves DNS to ensure destination is public.
 */
export async function validateUrlForSSRF(urlStr: string): Promise<SSRFValidationResult> {
  try {
    const parsed = new URL(urlStr);

    // Protocol check
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { safe: false, reason: `Disallowed protocol: ${parsed.protocol}. Only http and https are permitted.` };
    }

    const hostname = parsed.hostname;

    // Block obvious local hostnames
    const blockedHostnames = ["localhost", "local", "internal", "0.0.0.0", "broadcasthost"];
    if (blockedHostnames.includes(hostname.toLowerCase()) || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
      return { safe: false, reason: `Blocked hostname: ${hostname}` };
    }

    // Direct IP check
    if (net.isIP(hostname)) {
      if (net.isIPv4(hostname) && isPrivateIPv4(hostname)) {
        return { safe: false, reason: `Direct private IPv4 address forbidden: ${hostname}` };
      }
      if (net.isIPv6(hostname) && isPrivateIPv6(hostname)) {
        return { safe: false, reason: `Direct private IPv6 address forbidden: ${hostname}` };
      }
      return { safe: true, resolvedIp: hostname };
    }

    // DNS resolution
    try {
      const addresses = await dns.lookup(hostname, { all: true });
      if (!addresses || addresses.length === 0) {
        return { safe: false, reason: `Could not resolve hostname ${hostname}` };
      }

      for (const addr of addresses) {
        if (addr.family === 4 && isPrivateIPv4(addr.address)) {
          return { safe: false, reason: `Resolved to private IPv4 address: ${addr.address}` };
        }
        if (addr.family === 6 && isPrivateIPv6(addr.address)) {
          return { safe: false, reason: `Resolved to private IPv6 address: ${addr.address}` };
        }
      }

      return { safe: true, resolvedIp: addresses[0].address };
    } catch (dnsErr: any) {
      return { safe: false, reason: `DNS lookup failed for ${hostname}: ${dnsErr.message}` };
    }
  } catch (err: any) {
    return { safe: false, reason: `Malformed URL: ${err.message}` };
  }
}

export interface SafeFetchOptions extends RequestInit {
  timeoutMs?: number;
  maxRedirects?: number;
  maxSizeBytes?: number;
}

/**
 * Performs a network fetch protected against SSRF, infinite redirects, and oversized responses.
 */
export async function safeFetch(
  targetUrl: string,
  options: SafeFetchOptions = {}
): Promise<{ response: Response; finalUrl: string; durationMs: number }> {
  const {
    timeoutMs = 15000,
    maxRedirects = 5,
    maxSizeBytes = 52428800, // 50MB
    headers = {},
    ...fetchOpts
  } = options;

  let currentUrl = targetUrl;
  let redirects = 0;
  const startTime = Date.now();

  const userAgent = "Mozilla/5.0 (compatible; SitemapMonitor/1.0; +https://mysite.com/bot)";

  while (redirects <= maxRedirects) {
    // 1. SSRF check before every request (including redirect targets)
    const ssrfCheck = await validateUrlForSSRF(currentUrl);
    if (!ssrfCheck.safe) {
      throw new Error(`SSRF Protection: ${ssrfCheck.reason} (${currentUrl})`);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      res = await fetch(currentUrl, {
        ...fetchOpts,
        headers: {
          "User-Agent": userAgent,
          Accept: "text/xml, application/xml, application/xhtml+xml, text/html;q=0.9, text/plain;q=0.8, */*;q=0.5",
          ...headers,
        },
        redirect: "manual", // Handle redirects manually to inspect target URL
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    // Handle 3xx Redirects
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) {
        throw new Error(`Redirect HTTP ${res.status} without Location header`);
      }

      redirects++;
      if (redirects > maxRedirects) {
        throw new Error(`Exceeded maximum allowed redirects (${maxRedirects})`);
      }

      // Resolve relative redirect URL against current URL
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    // Verify content length header if present
    const contentLength = res.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > maxSizeBytes) {
      throw new Error(`Response size ${contentLength} bytes exceeds limit of ${maxSizeBytes} bytes`);
    }

    const durationMs = Date.now() - startTime;
    return { response: res, finalUrl: currentUrl, durationMs };
  }

  throw new Error(`Too many redirects`);
}

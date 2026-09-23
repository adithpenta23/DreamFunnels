import { describe, expect, it } from "vitest"
import { clientIpFromHeaders, ipRateLimitSubject } from "./request-ip"

const headers = (values: Record<string, string>) => new Headers(values)

describe("clientIpFromHeaders", () => {
  it("uses the first x-forwarded-for entry (the client, as set by the platform)", () => {
    expect(clientIpFromHeaders(headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe(
      "203.0.113.7"
    )
  })

  it("falls back to x-real-ip", () => {
    expect(clientIpFromHeaders(headers({ "x-real-ip": "198.51.100.23" }))).toBe("198.51.100.23")
  })

  it.each([
    ["[2001:db8::1]:443", "2001:db8::1"],
    ["203.0.113.7:51234", "203.0.113.7"],
    ["FE80::1%eth0", "fe80::1"],
    ["::1", "::1"],
  ])("normalises %j", (raw, expected) => {
    expect(clientIpFromHeaders(headers({ "x-forwarded-for": raw }))).toBe(expected)
  })

  it.each(["", "unknown", "not-an-ip", "999.1.1.1", "<script>"])(
    "returns null for %j rather than inventing a bucket",
    (raw) => {
      expect(clientIpFromHeaders(headers({ "x-forwarded-for": raw }))).toBeNull()
    }
  )

  it("returns null without any header", () => {
    expect(clientIpFromHeaders(headers({}))).toBeNull()
  })
})

describe("ipRateLimitSubject", () => {
  it("counts IPv4 per address", () => {
    expect(ipRateLimitSubject("203.0.113.7")).toBe("203.0.113.7")
  })

  it("counts IPv6 per /64, so rotating addresses inside one allocation doesn't help", () => {
    const a = ipRateLimitSubject("2001:db8:abcd:12::1")
    const b = ipRateLimitSubject("2001:0db8:abcd:0012:ffff:ffff:ffff:ffff")
    expect(a).toBe("2001:db8:abcd:12::/64")
    expect(b).toBe(a)
    expect(ipRateLimitSubject("2001:db8:abcd:13::1")).not.toBe(a)
  })

  it("expands compressed forms", () => {
    expect(ipRateLimitSubject("::1")).toBe("0:0:0:0::/64")
    expect(ipRateLimitSubject("2001:db8::")).toBe("2001:db8:0:0::/64")
  })

  it("treats IPv4-mapped IPv6 as the IPv4 client", () => {
    expect(ipRateLimitSubject("::ffff:203.0.113.7")).toBe("203.0.113.7")
    expect(ipRateLimitSubject("::ffff:cb00:7107")).toBe("203.0.113.7")
  })
})

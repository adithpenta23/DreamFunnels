import { isIP } from "node:net"

/**
 * The client's IP address as reported by the platform in front of us, for
 * per-IP rate limiting. Never for authorization.
 *
 * Trust model: Vercel overwrites `x-forwarded-for` with the real client IP
 * (clients can't inject their own), and `next start` fills it from the socket
 * when absent. Behind any other proxy, make sure it overwrites the header,
 * or per-IP limits become advisory (per-email limits and CAPTCHA still hold).
 */
export function clientIpFromHeaders(headers: Pick<Headers, "get">): string | null {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]
  const candidate = (forwarded || headers.get("x-real-ip") || "").trim()
  const ip = stripDecorations(candidate)
  return isIP(ip) ? ip.toLowerCase() : null
}

/** "[::1]:443" -> "::1", "203.0.113.7:51234" -> "203.0.113.7", "fe80::1%eth0" -> "fe80::1". */
function stripDecorations(value: string): string {
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(value)
  if (bracketed?.[1]) return bracketed[1].split("%")[0] ?? ""
  if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(value)) return value.split(":")[0] ?? ""
  return value.split("%")[0] ?? ""
}

/** "2001:db8::1" -> ["2001", "db8", "0", "0", "0", "0", "0", "1"]. Input must be valid IPv6. */
function ipv6Groups(ip: string): string[] {
  let address = ip
  // An embedded IPv4 tail ("::ffff:192.0.2.1") becomes two hex groups.
  const v4 = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(address)?.[1]
  if (v4) {
    const [a = 0, b = 0, c = 0, d = 0] = v4.split(".").map(Number)
    address = `${address.slice(0, -v4.length)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`
  }
  const [head = "", tail] = address.split("::")
  const headGroups = head ? head.split(":") : []
  const tailGroups = tail ? tail.split(":") : []
  const zeros = Array<string>(8 - headGroups.length - tailGroups.length).fill("0")
  return [...headGroups, ...(tail === undefined ? [] : zeros), ...tailGroups].map((group) =>
    (group.replace(/^0+/, "") || "0").toLowerCase()
  )
}

/**
 * What an IP is counted as. IPv4 counts per address. IPv6 counts per /64,
 * the smallest block normally assigned to one customer: counting single IPv6
 * addresses would let anyone rotate through 2^64 of them for free.
 */
export function ipRateLimitSubject(ip: string): string {
  if (isIP(ip) === 4) return ip
  const groups = ipv6Groups(ip)
  // IPv4-mapped IPv6 (::ffff:a.b.c.d) is really an IPv4 client.
  if (groups.slice(0, 5).every((group) => group === "0") && groups[5] === "ffff") {
    const [hi = 0, lo = 0] = groups.slice(6).map((group) => parseInt(group, 16))
    return [hi >> 8, hi & 255, lo >> 8, lo & 255].join(".")
  }
  return `${groups.slice(0, 4).join(":")}::/64`
}

import { describe, expect, it } from "vitest"
import {
  DEFAULT_TIMEZONE,
  TIMEZONE_IDS,
  TIMEZONE_PATTERN,
  canonicalTimezone,
  timezoneCity,
  timezoneLabel,
  timezoneOptions,
} from "./timezones"

describe("TIMEZONE_IDS", () => {
  it("is the global IANA set, not a handful of US zones", () => {
    expect(TIMEZONE_IDS.length).toBeGreaterThan(400)
    for (const zone of ["America/New_York", "Europe/London", "Asia/Kolkata", "Australia/Sydney"]) {
      expect(TIMEZONE_IDS).toContain(zone)
    }
    expect(TIMEZONE_IDS).toContain(DEFAULT_TIMEZONE)
  })

  it("only holds canonical ids the database accepts and Intl understands", () => {
    expect(new Set(TIMEZONE_IDS).size).toBe(TIMEZONE_IDS.length)
    for (const zone of TIMEZONE_IDS) {
      expect(zone).toMatch(TIMEZONE_PATTERN)
      expect(zone.startsWith("Etc/")).toBe(false)
      expect(() => new Intl.DateTimeFormat("en-US", { timeZone: zone })).not.toThrow()
    }
    // Current IANA names, not ICU's legacy ones.
    expect(TIMEZONE_IDS).not.toContain("Asia/Calcutta")
    expect(TIMEZONE_IDS).not.toContain("Europe/Kiev")
  })
})

describe("canonicalTimezone", () => {
  it.each([
    ["America/Chicago", "America/Chicago"],
    ["Asia/Calcutta", "Asia/Kolkata"],
    ["Europe/Kiev", "Europe/Kyiv"],
    ["US/Eastern", "America/New_York"],
    ["Etc/UTC", "UTC"],
    [" America/Denver ", "America/Denver"],
  ])("maps %j to %j", (input, expected) => {
    expect(canonicalTimezone(input)).toBe(expected)
  })

  it.each(["-5", "-05:00", "+05:30", "GMT-5", "Etc/GMT+5", "Mars/Olympus", "", null])(
    "rejects %j (offsets, abbreviations and unknown names)",
    (input) => {
      expect(canonicalTimezone(input)).toBeNull()
    }
  )
})

describe("labels", () => {
  const january = new Date("2026-01-15T12:00:00Z")

  it.each([
    ["America/New_York", "Eastern Time — New York"],
    ["America/Chicago", "Central Time — Chicago"],
    ["America/Denver", "Mountain Time — Denver"],
    ["America/Los_Angeles", "Pacific Time — Los Angeles"],
  ])("names %j as %j", (zone, label) => {
    expect(timezoneLabel(zone, january)).toBe(label)
  })

  it("describes places inside regions", () => {
    expect(timezoneCity("America/Indiana/Knox")).toBe("Knox, Indiana")
    expect(timezoneCity("America/Argentina/Buenos_Aires")).toBe("Buenos Aires, Argentina")
    expect(timezoneLabel("UTC")).toBe("Coordinated Universal Time (UTC)")
  })
})

describe("timezoneOptions", () => {
  it("lists every zone once, west to east, keeping the IANA id as the value", () => {
    const options = timezoneOptions(new Date("2026-01-15T12:00:00Z"))
    expect(options.map((option) => option.value).sort()).toEqual([...TIMEZONE_IDS].sort())

    const chicago = options.find((option) => option.value === "America/Chicago")
    expect(chicago).toMatchObject({ label: "Central Time — Chicago", offset: "GMT-6" })
    expect(chicago?.keywords).toContain("America/Chicago")

    const index = (zone: string) => options.findIndex((option) => option.value === zone)
    expect(index("Pacific/Honolulu")).toBeLessThan(index("America/Los_Angeles"))
    expect(index("America/Los_Angeles")).toBeLessThan(index("America/New_York"))
    expect(index("America/New_York")).toBeLessThan(index("UTC"))
    expect(index("UTC")).toBeLessThan(index("Asia/Kolkata"))
  })

  it("reflects daylight saving at the given date", () => {
    const july = timezoneOptions(new Date("2026-07-15T12:00:00Z"))
    expect(july.find((option) => option.value === "America/Chicago")?.offset).toBe("GMT-5")
    expect(july.find((option) => option.value === "Asia/Kolkata")?.offset).toBe("GMT+5:30")
  })
})

import { describe, expect, it } from "vitest"
import { clientSearchFilter, escapeLike } from "./client-search"

describe("clientSearchFilter", () => {
  it("matches name, business name and business email", () => {
    expect(clientSearchFilter("roofing")).toBe(
      'name.ilike."%roofing%",business_name.ilike."%roofing%",business_email.ilike."%roofing%"'
    )
  })

  it("adds the phone when the search has three or more digits, digits only", () => {
    expect(clientSearchFilter("(512) 555")).toContain('business_phone.like."%512555%"')
    expect(clientSearchFilter("+1 512")).toContain('business_phone.like."%1512%"')
    expect(clientSearchFilter("a1")).not.toContain("business_phone")
  })

  it("keeps PostgREST syntax out of user text: commas, dots and parentheses stay quoted", () => {
    const filter = clientSearchFilter("a,b).or(name.eq.x")
    // Exactly the three conditions, each value inside its own quotes.
    expect(filter.split('",').length).toBe(3)
    expect(filter.startsWith('name.ilike."%a,b).or(name.eq.x%"')).toBe(true)
  })

  it("escapes quotes and backslashes for PostgREST, and LIKE wildcards for Postgres", () => {
    expect(clientSearchFilter('say "hi"')).toContain('name.ilike."%say \\"hi\\"%"')
    expect(escapeLike("50%_off\\")).toBe("50\\%\\_off\\\\")
    expect(clientSearchFilter("50%")).toContain('name.ilike."%50\\\\%%"')
  })
})

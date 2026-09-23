"use client"

import { useActionState, useState } from "react"
import { FormError, FormField } from "@/components/forms/form-field"
import { SearchableSelect, type SelectOption } from "@/components/forms/searchable-select"
import { SubmitButton } from "@/components/forms/submit-button"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "@/components/ui/toast"
import { track } from "@/lib/analytics"
import { PHONE_HINT } from "@/lib/phone"
import { updateProfile, type UpdateProfileState } from "../actions"
import { SUPPORTED_LOCALES } from "../lib/locales"

type ProfileValues = {
  fullName: string
  phone: string
  timezone: string
  locale: string
}

type ProfileFormProps = {
  profile: {
    fullName: string | null
    email: string | null
    phone: string | null
    timezone: string
    locale: string
  }
  /** Built on the server (labels come from its Intl data). */
  timezoneOptions: readonly SelectOption[]
}

const LOCALE_OPTIONS: readonly SelectOption[] = SUPPORTED_LOCALES.map((locale) => ({
  value: locale.value,
  label: locale.label,
  keywords: locale.value,
}))

const valuesOf = (profile: {
  fullName: string | null
  phone: string | null
  timezone: string
  locale: string
}): ProfileValues => ({
  fullName: profile.fullName ?? "",
  phone: profile.phone ?? "",
  timezone: profile.timezone,
  locale: profile.locale,
})

export function ProfileForm({ profile, timezoneOptions }: ProfileFormProps) {
  // `saved` is what the server last confirmed; `values` is what's on screen.
  const [saved, setSaved] = useState(() => valuesOf(profile))
  const [values, setValues] = useState(saved)
  const set = (name: keyof ProfileValues) => (value: string) =>
    setValues((current) => ({ ...current, [name]: value }))

  const [state, formAction] = useActionState<UpdateProfileState, FormData>(
    async (previous, formData) => {
      const result = await updateProfile(previous, formData)
      if (result?.ok) {
        // Show exactly what was stored (e.g. the phone in E.164).
        const stored = valuesOf(result.data)
        setSaved(stored)
        setValues(stored)
        track("profile_updated")
        toast.success("Profile updated")
      }
      return result
    },
    null
  )

  const fieldErrors = state && !state.ok ? state.error.fieldErrors : undefined
  const formError = state && !state.ok && !fieldErrors ? state.error.message : undefined
  const dirty = (Object.keys(values) as (keyof ProfileValues)[]).some(
    (key) => values[key].trim() !== saved[key]
  )

  return (
    <form action={formAction} className="grid max-w-xl gap-5" noValidate>
      <FormField id="fullName" label="Full name" error={fieldErrors?.fullName}>
        <Input
          name="fullName"
          autoComplete="name"
          maxLength={120}
          value={values.fullName}
          onChange={(event) => set("fullName")(event.target.value)}
          required
        />
      </FormField>
      <FormField
        id="email"
        label="Email"
        hint="You sign in with this address. Changing it isn't available yet."
      >
        <Input type="email" value={profile.email ?? ""} readOnly disabled />
      </FormField>
      <FormField
        id="phone"
        label={
          <>
            Mobile phone <span className="font-normal text-muted-foreground">(optional)</span>
          </>
        }
        hint={`For notifications about your workspaces. ${PHONE_HINT}`}
        error={fieldErrors?.phone}
      >
        <Input
          name="phone"
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          placeholder="+1 512 555 0100"
          maxLength={40}
          value={values.phone}
          onChange={(event) => set("phone")(event.target.value)}
        />
      </FormField>
      <div className="grid gap-5 sm:grid-cols-2 sm:items-start">
        <FormField
          id="timezone"
          label="Your time zone"
          hint="For your own reminders and notifications."
          error={fieldErrors?.timezone}
        >
          <SearchableSelect
            name="timezone"
            options={timezoneOptions}
            value={values.timezone}
            onValueChange={(value) => set("timezone")(value ?? saved.timezone)}
            placeholder="Search by city or zone"
            emptyMessage="No time zone matches."
          />
        </FormField>
        <FormField
          id="locale"
          label="Date and number format"
          hint="How dates, times and numbers are written for you."
          error={fieldErrors?.locale}
        >
          <SearchableSelect
            name="locale"
            options={LOCALE_OPTIONS}
            value={values.locale}
            onValueChange={(value) => set("locale")(value ?? saved.locale)}
            placeholder="Search formats"
          />
        </FormField>
      </div>
      <FormError message={formError} />
      <div className="flex gap-2">
        <SubmitButton disabled={!dirty} pendingLabel="Saving…">
          Save changes
        </SubmitButton>
        {dirty ? (
          <Button type="button" variant="ghost" onClick={() => setValues(saved)}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  )
}

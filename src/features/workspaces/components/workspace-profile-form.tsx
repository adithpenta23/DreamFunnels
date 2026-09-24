"use client"

import { InfoIcon } from "lucide-react"
import { useActionState, useState, type ChangeEvent } from "react"
import { ColorField } from "@/components/forms/color-field"
import { FormError, FormField } from "@/components/forms/form-field"
import { SearchableSelect, type SelectOption } from "@/components/forms/searchable-select"
import { SubmitButton } from "@/components/forms/submit-button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { toast } from "@/components/ui/toast"
import { track } from "@/lib/analytics"
import { PHONE_HINT } from "@/lib/phone"
import { updateWorkspaceProfileAction, type UpdateWorkspaceProfileState } from "../actions"
import type { WorkspaceProfile } from "../types"

/** Every field as the form edits it: strings, "" meaning "not set". */
type ProfileValues = { [K in keyof WorkspaceProfile]: string }

const toValues = (profile: WorkspaceProfile): ProfileValues =>
  Object.fromEntries(
    Object.entries(profile).map(([key, value]) => [key, value ?? ""])
  ) as ProfileValues

type WorkspaceProfileFormProps = {
  workspaceId: string
  /** Placeholder for the business name, which defaults to it. */
  workspaceName: string
  profile: WorkspaceProfile
  /** Owners and admins. Others see the profile read-only (the server enforces it too). */
  canManage: boolean
  /** Built on the server, so every browser shows the same labels. */
  timezoneOptions: readonly SelectOption[]
  countryOptions: readonly SelectOption[]
}

export function WorkspaceProfileForm({
  workspaceId,
  workspaceName,
  profile,
  canManage,
  timezoneOptions,
  countryOptions,
}: WorkspaceProfileFormProps) {
  // `saved` is what the server last confirmed; `values` is what's on screen.
  // Both survive a failed save, so nothing typed is lost.
  const [saved, setSaved] = useState(() => toValues(profile))
  const [values, setValues] = useState(saved)
  const set = (name: keyof ProfileValues) => (value: string) =>
    setValues((current) => ({ ...current, [name]: value }))
  const text = (name: keyof ProfileValues) => ({
    name,
    value: values[name],
    onChange: (event: ChangeEvent<HTMLInputElement>) => set(name)(event.target.value),
    disabled: !canManage,
  })

  const [state, formAction] = useActionState<UpdateWorkspaceProfileState, FormData>(
    async (previous, formData) => {
      const result = await updateWorkspaceProfileAction(previous, formData)
      if (result?.ok) {
        // Show exactly what was stored (phone in E.164, colors lowercased).
        const stored = toValues(result.data)
        setSaved(stored)
        setValues(stored)
        track("workspace_profile_updated")
        toast.success("Business profile saved")
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
    <form action={formAction} className="grid max-w-2xl gap-6" noValidate>
      <input type="hidden" name="workspaceId" value={workspaceId} />
      {!canManage ? (
        <Alert>
          <InfoIcon aria-hidden />
          <AlertDescription>
            Only workspace owners and admins can change the business profile.
          </AlertDescription>
        </Alert>
      ) : null}

      <fieldset className="grid gap-5">
        <legend className="sr-only">Business details</legend>
        <FormField
          id="businessName"
          label="Business name"
          hint="What customers see. Leave blank to use the workspace name."
          error={fieldErrors?.businessName}
        >
          <Input
            autoComplete="organization"
            maxLength={120}
            placeholder={workspaceName}
            {...text("businessName")}
          />
        </FormField>
        <div className="grid gap-5 sm:grid-cols-2 sm:items-start">
          <FormField id="businessEmail" label="Email" error={fieldErrors?.businessEmail}>
            <Input
              type="email"
              autoComplete="email"
              maxLength={254}
              placeholder="hello@yourbusiness.com"
              {...text("businessEmail")}
            />
          </FormField>
          <FormField
            id="businessPhone"
            label="Phone"
            hint={PHONE_HINT}
            error={fieldErrors?.businessPhone}
          >
            <Input
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              maxLength={40}
              placeholder="+1 512 555 0100"
              {...text("businessPhone")}
            />
          </FormField>
        </div>
        <FormField id="websiteUrl" label="Website" error={fieldErrors?.websiteUrl}>
          <Input
            type="url"
            inputMode="url"
            autoComplete="url"
            maxLength={2048}
            placeholder="https://yourbusiness.com"
            {...text("websiteUrl")}
          />
        </FormField>
        <FormField
          id="timezone"
          label="Time zone"
          hint="Used for appointment times, reminders and reports."
          error={fieldErrors?.timezone}
        >
          <SearchableSelect
            name="timezone"
            options={timezoneOptions}
            value={values.timezone}
            onValueChange={(value) => set("timezone")(value ?? saved.timezone)}
            placeholder="Search by city or zone"
            emptyMessage="No time zone matches."
            disabled={!canManage}
          />
        </FormField>
      </fieldset>

      <Separator />

      <fieldset className="grid gap-5">
        <legend className="mb-1 text-sm font-medium">Address</legend>
        <FormField id="addressLine1" label="Street address" error={fieldErrors?.addressLine1}>
          <Input autoComplete="address-line1" maxLength={200} {...text("addressLine1")} />
        </FormField>
        <FormField
          id="addressLine2"
          label={
            <>
              Apartment, suite, etc.{" "}
              <span className="font-normal text-muted-foreground">(optional)</span>
            </>
          }
          error={fieldErrors?.addressLine2}
        >
          <Input autoComplete="address-line2" maxLength={200} {...text("addressLine2")} />
        </FormField>
        <div className="grid gap-5 sm:grid-cols-2 sm:items-start">
          <FormField id="addressCity" label="City" error={fieldErrors?.addressCity}>
            <Input autoComplete="address-level2" maxLength={100} {...text("addressCity")} />
          </FormField>
          <FormField
            id="addressRegion"
            label="State, province or region"
            error={fieldErrors?.addressRegion}
          >
            <Input autoComplete="address-level1" maxLength={100} {...text("addressRegion")} />
          </FormField>
          <FormField
            id="addressPostalCode"
            label="ZIP or postal code"
            error={fieldErrors?.addressPostalCode}
          >
            <Input autoComplete="postal-code" maxLength={20} {...text("addressPostalCode")} />
          </FormField>
          <FormField id="addressCountry" label="Country" error={fieldErrors?.addressCountry}>
            <SearchableSelect
              name="addressCountry"
              options={countryOptions}
              value={values.addressCountry || null}
              onValueChange={(value) => set("addressCountry")(value ?? "")}
              placeholder="Search countries"
              emptyMessage="No country matches."
              clearable
              disabled={!canManage}
            />
          </FormField>
        </div>
      </fieldset>

      <Separator />

      <fieldset className="grid gap-5">
        <legend className="mb-1 text-sm font-medium">Brand</legend>
        <FormField
          id="logoUrl"
          label="Logo URL"
          hint="A link to your logo image, starting with https://. Uploading comes later."
          error={fieldErrors?.logoUrl}
        >
          <Input
            type="url"
            inputMode="url"
            maxLength={2048}
            placeholder="https://yourbusiness.com/logo.png"
            {...text("logoUrl")}
          />
        </FormField>
        {values.logoUrl.startsWith("https://") && !fieldErrors?.logoUrl ? (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            {/* A user-supplied URL can be any host, so next/image's allow-list doesn't apply. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={values.logoUrl}
              alt="Logo preview"
              className="h-10 max-w-40 rounded border bg-background object-contain p-1"
              referrerPolicy="no-referrer"
            />
            Preview
          </div>
        ) : null}
        <div className="grid gap-5 sm:grid-cols-2 sm:items-start">
          <FormField
            id="brandPrimaryColor"
            label="Primary color"
            error={fieldErrors?.brandPrimaryColor}
          >
            <ColorField
              name="brandPrimaryColor"
              value={values.brandPrimaryColor}
              onValueChange={set("brandPrimaryColor")}
              colorName="primary color"
              disabled={!canManage}
            />
          </FormField>
          <FormField
            id="brandSecondaryColor"
            label="Secondary color"
            error={fieldErrors?.brandSecondaryColor}
          >
            <ColorField
              name="brandSecondaryColor"
              value={values.brandSecondaryColor}
              onValueChange={set("brandSecondaryColor")}
              colorName="secondary color"
              disabled={!canManage}
            />
          </FormField>
        </div>
      </fieldset>

      <FormError message={formError} />
      {canManage ? (
        <div className="flex gap-2">
          <SubmitButton disabled={!dirty} pendingLabel="Saving…">
            Save business profile
          </SubmitButton>
          {dirty ? (
            <Button type="button" variant="ghost" onClick={() => setValues(saved)}>
              Cancel
            </Button>
          ) : null}
        </div>
      ) : null}
    </form>
  )
}

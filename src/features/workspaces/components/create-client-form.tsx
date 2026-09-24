"use client"

import { CircleCheckIcon, InfoIcon, TriangleAlertIcon } from "lucide-react"
import Link from "next/link"
import { useActionState, useState, type ChangeEvent } from "react"
import { FormError, FormField } from "@/components/forms/form-field"
import { SearchableSelect, type SelectOption } from "@/components/forms/searchable-select"
import { SubmitButton } from "@/components/forms/submit-button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { routes } from "@/config/routes"
import { track } from "@/lib/analytics"
import { PHONE_HINT } from "@/lib/phone"
import {
  createClientWorkspaceAction,
  type CreateClientResult,
  type CreateClientState,
} from "../actions"
import type { AssignableMemberRole } from "../lib/members"
import { suggestWorkspaceSlug } from "../lib/slug"
import { RoleOptions } from "./role-options"
import { WorkspaceUrlInput } from "./workspace-url-input"

type CreateClientFormProps = {
  agency: { id: string; name: string; slug: string }
  /** New clients start in the agency's time zone; most agencies are local. */
  defaultTimezone: string
  timezoneOptions: readonly SelectOption[]
  countryOptions: readonly SelectOption[]
}

/**
 * "Add client": the business, where it lives, its workspace, and optionally
 * who to invite. One focused form rather than a wizard: it's short, and the
 * summary at the end says exactly what will happen before anything does.
 */
export function CreateClientForm(props: CreateClientFormProps) {
  // "Add another client" starts a fresh form.
  const [round, setRound] = useState(0)
  return <ClientForm key={round} {...props} onAddAnother={() => setRound((value) => value + 1)} />
}

const EMPTY = {
  businessName: "",
  workspaceName: "",
  workspaceSlug: "",
  businessEmail: "",
  businessPhone: "",
  websiteUrl: "",
  addressLine1: "",
  addressLine2: "",
  addressCity: "",
  addressRegion: "",
  addressPostalCode: "",
  addressCountry: "",
  ownerEmail: "",
}

type Values = typeof EMPTY

function ClientForm({
  agency,
  defaultTimezone,
  timezoneOptions,
  countryOptions,
  onAddAnother,
}: CreateClientFormProps & { onAddAnother: () => void }) {
  // Controlled, so a failed attempt keeps everything that was typed.
  const [values, setValues] = useState<Values>(EMPTY)
  const [timezone, setTimezone] = useState(defaultTimezone)
  const [ownerRole, setOwnerRole] = useState<AssignableMemberRole>("admin")
  const text = (name: keyof Values) => ({
    name,
    value: values[name],
    onChange: (event: ChangeEvent<HTMLInputElement>) =>
      setValues((current) => ({ ...current, [name]: event.target.value })),
  })

  const [state, formAction] = useActionState<CreateClientState, FormData>(
    async (previous, formData) => {
      const result = await createClientWorkspaceAction(previous, formData)
      if (result?.ok) {
        track("client_created", { invitationSent: result.data.invitation?.outcome === "sent" })
      }
      return result
    },
    null
  )

  if (state?.ok)
    return <ClientCreated result={state.data} agency={agency} onAddAnother={onAddAnother} />

  const fieldErrors = state && !state.ok ? state.error.fieldErrors : undefined
  const formError = state && !state.ok && !fieldErrors ? state.error.message : undefined
  const effectiveName = values.workspaceName.trim() || values.businessName.trim()
  const suggestion = suggestWorkspaceSlug(effectiveName)
  const inviteEmail = values.ownerEmail.trim()

  return (
    <form action={formAction} className="grid max-w-2xl gap-6" noValidate>
      <input type="hidden" name="agencyId" value={agency.id} />

      <fieldset className="grid gap-5">
        <legend className="mb-2 text-base font-semibold">Business</legend>
        <FormField
          id="businessName"
          label="Business name"
          hint="How customers know them. Required."
          error={fieldErrors?.businessName}
        >
          <Input
            autoComplete="off"
            maxLength={120}
            placeholder="ABC Roofing"
            required
            autoFocus
            {...text("businessName")}
          />
        </FormField>
        <div className="grid gap-5 sm:grid-cols-2 sm:items-start">
          <FormField
            id="businessEmail"
            label={<Optional label="Business email" />}
            error={fieldErrors?.businessEmail}
          >
            <Input
              type="email"
              autoComplete="off"
              maxLength={254}
              placeholder="hello@abcroofing.com"
              {...text("businessEmail")}
            />
          </FormField>
          <FormField
            id="businessPhone"
            label={<Optional label="Business phone" />}
            hint={PHONE_HINT}
            error={fieldErrors?.businessPhone}
          >
            <Input
              type="tel"
              autoComplete="off"
              inputMode="tel"
              maxLength={40}
              placeholder="+1 512 555 0100"
              {...text("businessPhone")}
            />
          </FormField>
        </div>
        <FormField
          id="websiteUrl"
          label={<Optional label="Website" />}
          error={fieldErrors?.websiteUrl}
        >
          <Input
            type="url"
            inputMode="url"
            autoComplete="off"
            maxLength={2048}
            placeholder="https://abcroofing.com"
            {...text("websiteUrl")}
          />
        </FormField>
        <FormField
          id="timezone"
          label="Time zone"
          hint="Their appointments, reminders and reports use it."
          error={fieldErrors?.timezone}
        >
          <SearchableSelect
            name="timezone"
            options={timezoneOptions}
            value={timezone}
            onValueChange={(value) => setTimezone(value ?? defaultTimezone)}
            placeholder="Search by city or zone"
            emptyMessage="No time zone matches."
          />
        </FormField>
      </fieldset>

      <Separator />

      <fieldset className="grid gap-5">
        <legend className="mb-2 text-base font-semibold">
          Address <span className="font-normal text-muted-foreground">(optional)</span>
        </legend>
        <FormField id="addressLine1" label="Street address" error={fieldErrors?.addressLine1}>
          <Input autoComplete="off" maxLength={200} {...text("addressLine1")} />
        </FormField>
        <FormField
          id="addressLine2"
          label="Apartment, suite, etc."
          error={fieldErrors?.addressLine2}
        >
          <Input autoComplete="off" maxLength={200} {...text("addressLine2")} />
        </FormField>
        <div className="grid gap-5 sm:grid-cols-2 sm:items-start">
          <FormField id="addressCity" label="City" error={fieldErrors?.addressCity}>
            <Input autoComplete="off" maxLength={100} {...text("addressCity")} />
          </FormField>
          <FormField
            id="addressRegion"
            label="State, province or region"
            error={fieldErrors?.addressRegion}
          >
            <Input autoComplete="off" maxLength={100} {...text("addressRegion")} />
          </FormField>
          <FormField
            id="addressPostalCode"
            label="ZIP or postal code"
            error={fieldErrors?.addressPostalCode}
          >
            <Input autoComplete="off" maxLength={20} {...text("addressPostalCode")} />
          </FormField>
          <FormField id="addressCountry" label="Country" error={fieldErrors?.addressCountry}>
            <SearchableSelect
              name="addressCountry"
              options={countryOptions}
              value={values.addressCountry || null}
              onValueChange={(value) =>
                setValues((current) => ({ ...current, addressCountry: value ?? "" }))
              }
              placeholder="Search countries"
              emptyMessage="No country matches."
              clearable
            />
          </FormField>
        </div>
      </fieldset>

      <Separator />

      <fieldset className="grid gap-5">
        <legend className="mb-2 text-base font-semibold">Workspace</legend>
        <FormField
          id="workspaceName"
          label={<Optional label="Workspace name" />}
          hint="Shown in your workspace switcher. Leave blank to use the business name."
          error={fieldErrors?.workspaceName}
        >
          <Input
            autoComplete="off"
            maxLength={80}
            placeholder={values.businessName.trim() || "ABC Roofing"}
            {...text("workspaceName")}
          />
        </FormField>
        <FormField
          id="workspaceSlug"
          label={<Optional label="Workspace URL" />}
          hint={
            values.workspaceSlug.trim()
              ? "Lowercase letters, numbers and hyphens. You can change it later."
              : suggestion
                ? `Leave blank to use “${suggestion}” (we'll add a few characters if it's taken).`
                : "Leave blank and we'll create one from the name."
          }
          error={fieldErrors?.workspaceSlug}
        >
          <WorkspaceUrlInput
            name="workspaceSlug"
            placeholder={suggestion ?? "abc-roofing"}
            maxLength={48}
            value={values.workspaceSlug}
            onValueChange={(value) =>
              setValues((current) => ({ ...current, workspaceSlug: value }))
            }
          />
        </FormField>
      </fieldset>

      <Separator />

      <fieldset className="grid gap-5">
        <legend className="mb-2 text-base font-semibold">
          Invite someone from the business{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </legend>
        <FormField
          id="ownerEmail"
          label="Their email"
          hint="Usually the business owner. You can also invite people later from the client's Members page."
          error={fieldErrors?.ownerEmail}
        >
          <Input
            type="email"
            autoComplete="off"
            maxLength={254}
            placeholder="owner@abcroofing.com"
            {...text("ownerEmail")}
          />
        </FormField>
        {inviteEmail ? (
          <RoleOptions
            name="ownerRole"
            legend="Their role"
            value={ownerRole}
            onValueChange={setOwnerRole}
            workspaceType="client"
            error={fieldErrors?.ownerRole}
          />
        ) : null}
      </fieldset>

      <Alert>
        <InfoIcon aria-hidden />
        <AlertTitle>What happens next</AlertTitle>
        <AlertDescription>
          <ul className="list-disc space-y-1 pl-4">
            <li>
              A new, empty workspace for {effectiveName || "this client"} is created. Nothing is
              copied from {agency.name}.
            </li>
            <li>You and the other owners and admins of {agency.name} can open and manage it.</li>
            <li>
              {inviteEmail
                ? `We'll email an invitation to ${inviteEmail} to join as ${ownerRole === "admin" ? "an admin" : "a member"}.`
                : "Nobody else is invited yet."}
            </li>
          </ul>
        </AlertDescription>
      </Alert>

      <FormError message={formError} />
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pendingLabel="Creating client workspace…">
          Create client workspace
        </SubmitButton>
        <Link href={routes.clients(agency.slug)} className={buttonVariants({ variant: "ghost" })}>
          Cancel
        </Link>
      </div>
    </form>
  )
}

function Optional({ label }: { label: string }) {
  return (
    <>
      {label} <span className="font-normal text-muted-foreground">(optional)</span>
    </>
  )
}

function ClientCreated({
  result,
  agency,
  onAddAnother,
}: {
  result: CreateClientResult
  agency: { name: string; slug: string }
  onAddAnother: () => void
}) {
  const { client, invitation } = result
  return (
    <div role="status" className="grid max-w-2xl gap-5">
      <div className="flex items-start gap-3">
        <CircleCheckIcon className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden />
        <div className="space-y-1">
          <h2 className="font-semibold">Client workspace created</h2>
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">{client.name}</strong> is ready. It&apos;s empty,
            and it&apos;s managed by {agency.name}.
          </p>
        </div>
      </div>

      {invitation?.outcome === "sent" ? (
        <p className="text-sm">
          Invitation sent to <strong>{invitation.email}</strong>.
        </p>
      ) : null}
      {invitation && invitation.outcome !== "sent" ? (
        <Alert variant="destructive">
          <TriangleAlertIcon aria-hidden />
          <AlertTitle>
            {invitation.outcome === "not_sent"
              ? `The invitation email to ${invitation.email} couldn't be sent`
              : `${invitation.email} wasn't invited`}
          </AlertTitle>
          <AlertDescription>
            {invitation.outcome === "not_sent"
              ? "The invitation is saved. Resend it from the client's Members page."
              : `${invitation.message ?? "Something went wrong."} You can invite them from the client's Members page.`}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Link href={routes.workspace(client.slug)} className={buttonVariants()}>
          Open {client.name}
        </Link>
        <Link
          href={routes.workspaceMembers(client.slug)}
          className={buttonVariants({ variant: "outline" })}
        >
          Members
        </Link>
        <Button variant="outline" onClick={onAddAnother}>
          Add another client
        </Button>
        <Link href={routes.clients(agency.slug)} className={buttonVariants({ variant: "ghost" })}>
          Back to clients
        </Link>
      </div>
    </div>
  )
}

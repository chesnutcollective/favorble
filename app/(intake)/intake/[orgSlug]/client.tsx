"use client";

import * as React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { I18nProvider, useTranslation } from "@/lib/i18n/useTranslation";
import type { Locale } from "@/lib/i18n/messages";
import { LanguageToggle } from "@/components/intake/language-toggle";
import {
  submitPublicIntake,
  type PublicIntakeSubmission,
  type PublicIntakeResult,
} from "@/app/actions/public-intake";
import { cn } from "@/lib/utils";

const BRAND = "#263c94";
const STEP_COUNT = 5;

// ─── Form state ────────────────────────────────────────────────────────

type PersonalState = {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  ssnLast4: string;
  email: string;
  phone: string;
  preferredContact: "email" | "phone" | "text" | "";
  address: string;
  city: string;
  state: string;
  zip: string;
};

type DisabilityState = {
  disabilityStartDate: string;
  conditions: string;
  currentlyWorking: "yes" | "no" | "";
  workingHoursPerWeek: string;
  monthlyEarnings: string;
  filedBefore: "yes" | "no" | "";
  benefitType: "ssdi" | "ssi" | "both" | "unsure" | "";
};

type Provider = {
  name: string;
  specialty: string;
  phone: string;
  city: string;
  lastVisit: string;
};

type Job = {
  employer: string;
  jobTitle: string;
  startDate: string;
  endDate: string;
  currentJob: boolean;
  duties: string;
};

type FormState = {
  personal: PersonalState;
  disability: DisabilityState;
  providers: Provider[];
  workHistory: Job[];
  consent: boolean;
};

const EMPTY_STATE: FormState = {
  personal: {
    firstName: "",
    lastName: "",
    dateOfBirth: "",
    ssnLast4: "",
    email: "",
    phone: "",
    preferredContact: "",
    address: "",
    city: "",
    state: "",
    zip: "",
  },
  disability: {
    disabilityStartDate: "",
    conditions: "",
    currentlyWorking: "",
    workingHoursPerWeek: "",
    monthlyEarnings: "",
    filedBefore: "",
    benefitType: "",
  },
  providers: [],
  workHistory: [],
  consent: false,
};

// ─── Root wrapper ──────────────────────────────────────────────────────

export function IntakeFormClient({
  orgSlug,
  orgName,
  initialLocale,
}: {
  orgSlug: string;
  orgName: string;
  initialLocale: Locale;
}) {
  return (
    <I18nProvider initialLocale={initialLocale}>
      <IntakeShell orgSlug={orgSlug} orgName={orgName} />
    </I18nProvider>
  );
}

// ─── Shell with step state ─────────────────────────────────────────────

function IntakeShell({
  orgSlug,
  orgName,
}: {
  orgSlug: string;
  orgName: string;
}) {
  const { t, locale } = useTranslation();
  const [step, setStep] = React.useState<1 | 2 | 3 | 4 | 5>(1);
  const [state, setState] = React.useState<FormState>(EMPTY_STATE);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [submitting, setSubmitting] = React.useState(false);
  const [result, setResult] = React.useState<PublicIntakeResult | null>(null);

  const update = React.useCallback(
    <K extends keyof FormState>(key: K, value: FormState[K]) => {
      setState((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  function validateStep(current: number): boolean {
    const next: Record<string, string> = {};
    if (current === 1) {
      if (!state.personal.firstName.trim())
        next["personal.firstName"] = t("intake.validation.required");
      if (!state.personal.lastName.trim())
        next["personal.lastName"] = t("intake.validation.required");
      if (
        state.personal.email &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.personal.email)
      )
        next["personal.email"] = t("intake.validation.invalidEmail");
      if (state.personal.ssnLast4 && !/^\d{4}$/.test(state.personal.ssnLast4))
        next["personal.ssnLast4"] = t("intake.validation.ssnFormat");
    }
    if (current === 2) {
      if (!state.disability.conditions.trim())
        next["disability.conditions"] = t("intake.validation.required");
    }
    if (current === 5) {
      if (!state.consent) next.consent = t("intake.validation.required");
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit() {
    if (!validateStep(5)) return;
    setSubmitting(true);
    try {
      const submission: PublicIntakeSubmission = {
        preferredLanguage: locale,
        personal: {
          firstName: state.personal.firstName,
          lastName: state.personal.lastName,
          dateOfBirth: state.personal.dateOfBirth || undefined,
          ssnLast4: state.personal.ssnLast4 || undefined,
          email: state.personal.email || undefined,
          phone: state.personal.phone || undefined,
          preferredContact: state.personal.preferredContact || undefined,
          address: state.personal.address || undefined,
          city: state.personal.city || undefined,
          state: state.personal.state || undefined,
          zip: state.personal.zip || undefined,
        },
        disability: {
          disabilityStartDate:
            state.disability.disabilityStartDate || undefined,
          conditions: state.disability.conditions || undefined,
          currentlyWorking: state.disability.currentlyWorking === "yes",
          workingHoursPerWeek:
            state.disability.workingHoursPerWeek || undefined,
          monthlyEarnings: state.disability.monthlyEarnings || undefined,
          filedBefore: state.disability.filedBefore === "yes",
          benefitType: state.disability.benefitType || undefined,
        },
        providers: state.providers,
        workHistory: state.workHistory.map((j) => ({
          employer: j.employer,
          jobTitle: j.jobTitle,
          startDate: j.startDate,
          endDate: j.currentJob ? undefined : j.endDate,
          currentJob: j.currentJob,
          duties: j.duties,
        })),
        consent: state.consent,
      };

      const res = await submitPublicIntake(orgSlug, submission);
      setResult(res);
    } catch {
      setResult({ ok: false, error: t("common.errorGeneric") });
    } finally {
      setSubmitting(false);
    }
  }

  if (result?.ok) {
    return <SuccessView referenceNumber={result.referenceNumber} />;
  }

  return (
    <div className="mx-auto w-full max-w-[640px] px-4 py-8 sm:py-12">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {orgName}
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
            {t("intake.header.title")}
          </h1>
        </div>
        <LanguageToggle />
      </header>

      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        {t("intake.header.subtitle")}
      </p>
      <p className="mb-6 text-xs text-muted-foreground">
        {t("intake.header.estimatedTime")}
      </p>

      <StepIndicator current={step} total={STEP_COUNT} />

      {result && !result.ok ? (
        <div className="mb-4 rounded-md border border-[#EE0000] bg-[#FFF5F5] px-4 py-3 text-sm text-[#CC0000]">
          {result.error}
        </div>
      ) : null}

      <Card className="mt-6">
        {step === 1 && (
          <Step1
            state={state.personal}
            errors={errors}
            onChange={(personal) => update("personal", personal)}
          />
        )}
        {step === 2 && (
          <Step2
            state={state.disability}
            errors={errors}
            onChange={(disability) => update("disability", disability)}
          />
        )}
        {step === 3 && (
          <Step3
            providers={state.providers}
            onChange={(providers) => update("providers", providers)}
          />
        )}
        {step === 4 && (
          <Step4
            jobs={state.workHistory}
            onChange={(workHistory) => update("workHistory", workHistory)}
          />
        )}
        {step === 5 && (
          <Step5
            state={state}
            errors={errors}
            onConsentChange={(consent) => update("consent", consent)}
          />
        )}

        <CardFooter className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <Button
            type="button"
            variant="outline"
            disabled={step === 1 || submitting}
            onClick={() => setStep((s) => (s > 1 ? ((s - 1) as typeof s) : s))}
          >
            {t("intake.nav.back")}
          </Button>

          {step < STEP_COUNT ? (
            <Button
              type="button"
              disabled={submitting}
              onClick={() => {
                if (validateStep(step)) setStep((s) => (s + 1) as typeof s);
              }}
              style={{ backgroundColor: BRAND, borderColor: BRAND }}
              className="hover:brightness-110"
            >
              {t("intake.nav.next")}
            </Button>
          ) : (
            <Button
              type="button"
              disabled={submitting || !state.consent}
              onClick={handleSubmit}
              style={{ backgroundColor: BRAND, borderColor: BRAND }}
              className="hover:brightness-110"
            >
              {submitting ? t("common.saving") : t("intake.step5.submitButton")}
            </Button>
          )}
        </CardFooter>
      </Card>

      <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
        {t("common.privacyNotice")}
      </p>
      <p className="mt-2 text-[11px] text-muted-foreground">
        {t("common.poweredBy")}
      </p>
    </div>
  );
}

// ─── Step indicator ────────────────────────────────────────────────────

function StepIndicator({ current, total }: { current: number; total: number }) {
  const { t } = useTranslation();
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs font-medium text-muted-foreground">
        <span>
          {t("intake.progress.step")} {current} {t("intake.progress.of")}{" "}
          {total}
        </span>
        <span>{Math.round((current / total) * 100)}%</span>
      </div>
      <div className="flex gap-1.5">
        {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
          <div
            key={n}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors duration-200",
              n <= current ? "" : "bg-[#E4E4E9]",
            )}
            style={n <= current ? { backgroundColor: BRAND } : undefined}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Step 1: Personal ──────────────────────────────────────────────────

function Step1({
  state,
  errors,
  onChange,
}: {
  state: PersonalState;
  errors: Record<string, string>;
  onChange: (state: PersonalState) => void;
}) {
  const { t } = useTranslation();
  const set = <K extends keyof PersonalState>(k: K, v: PersonalState[K]) =>
    onChange({ ...state, [k]: v });

  return (
    <>
      <CardHeader>
        <CardTitle style={{ color: BRAND }}>
          {t("intake.step1.title")}
        </CardTitle>
        <CardDescription>{t("intake.step1.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="firstName"
            label={t("intake.step1.firstName")}
            required
            error={errors["personal.firstName"]}
          >
            <Input
              id="firstName"
              value={state.firstName}
              onChange={(e) => set("firstName", e.target.value)}
              autoComplete="given-name"
            />
          </Field>
          <Field
            id="lastName"
            label={t("intake.step1.lastName")}
            required
            error={errors["personal.lastName"]}
          >
            <Input
              id="lastName"
              value={state.lastName}
              onChange={(e) => set("lastName", e.target.value)}
              autoComplete="family-name"
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="dob"
            label={t("intake.step1.dateOfBirth")}
            help={t("intake.step1.dateOfBirthHelp")}
          >
            <Input
              id="dob"
              value={state.dateOfBirth}
              onChange={(e) => set("dateOfBirth", e.target.value)}
              placeholder="MM/DD/YYYY"
              inputMode="numeric"
              autoComplete="bday"
            />
          </Field>
          <Field
            id="ssn4"
            label={t("intake.step1.ssnLast4")}
            help={t("intake.step1.ssnLast4Help")}
            error={errors["personal.ssnLast4"]}
          >
            <Input
              id="ssn4"
              value={state.ssnLast4}
              onChange={(e) =>
                set("ssnLast4", e.target.value.replace(/\D/g, "").slice(0, 4))
              }
              placeholder="••••"
              inputMode="numeric"
              maxLength={4}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="email"
            label={t("intake.step1.email")}
            error={errors["personal.email"]}
          >
            <Input
              id="email"
              type="email"
              value={state.email}
              onChange={(e) => set("email", e.target.value)}
              autoComplete="email"
            />
          </Field>
          <Field
            id="phone"
            label={t("intake.step1.phone")}
            help={t("intake.step1.phoneHelp")}
          >
            <Input
              id="phone"
              type="tel"
              value={state.phone}
              onChange={(e) => set("phone", e.target.value)}
              autoComplete="tel"
            />
          </Field>
        </div>

        <div className="space-y-1.5">
          <span
            id="preferredContact-label"
            className="text-sm font-medium leading-none text-foreground"
          >
            {t("intake.step1.preferredContact")}
          </span>
          <PillRadioGroup
            ariaLabelledBy="preferredContact-label"
            value={state.preferredContact}
            onChange={(v) =>
              set("preferredContact", v as PersonalState["preferredContact"])
            }
            options={[
              { value: "email", label: t("intake.step1.contactEmail") },
              { value: "phone", label: t("intake.step1.contactPhone") },
              { value: "text", label: t("intake.step1.contactText") },
            ]}
            className="flex flex-wrap gap-2"
            optionClassName={(active) =>
              cn(
                "rounded-full border px-4 py-1.5 text-sm transition-colors duration-200",
                active
                  ? "border-transparent text-white"
                  : "border-border bg-white text-foreground hover:border-[#CCC]",
              )
            }
            activeStyle={{ backgroundColor: BRAND }}
          />
        </div>

        <Field id="address" label={t("intake.step1.address")}>
          <Input
            id="address"
            value={state.address}
            onChange={(e) => set("address", e.target.value)}
            autoComplete="street-address"
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field id="city" label={t("intake.step1.city")}>
            <Input
              id="city"
              value={state.city}
              onChange={(e) => set("city", e.target.value)}
              autoComplete="address-level2"
            />
          </Field>
          <Field id="state" label={t("intake.step1.state")}>
            <Input
              id="state"
              value={state.state}
              onChange={(e) => set("state", e.target.value)}
              autoComplete="address-level1"
            />
          </Field>
          <Field id="zip" label={t("intake.step1.zip")}>
            <Input
              id="zip"
              value={state.zip}
              onChange={(e) => set("zip", e.target.value)}
              autoComplete="postal-code"
            />
          </Field>
        </div>
      </CardContent>
    </>
  );
}

// ─── Step 2: Disability ────────────────────────────────────────────────

function Step2({
  state,
  errors,
  onChange,
}: {
  state: DisabilityState;
  errors: Record<string, string>;
  onChange: (state: DisabilityState) => void;
}) {
  const { t } = useTranslation();
  const set = <K extends keyof DisabilityState>(k: K, v: DisabilityState[K]) =>
    onChange({ ...state, [k]: v });

  return (
    <>
      <CardHeader>
        <CardTitle style={{ color: BRAND }}>
          {t("intake.step2.title")}
        </CardTitle>
        <CardDescription>{t("intake.step2.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <Field
          id="disabilityStart"
          label={t("intake.step2.disabilityStartDate")}
          help={t("intake.step2.disabilityStartDateHelp")}
        >
          <Input
            id="disabilityStart"
            value={state.disabilityStartDate}
            onChange={(e) => set("disabilityStartDate", e.target.value)}
            placeholder="MM/DD/YYYY"
          />
        </Field>

        <Field
          id="conditions"
          label={t("intake.step2.conditions")}
          required
          error={errors["disability.conditions"]}
        >
          <Textarea
            id="conditions"
            rows={4}
            value={state.conditions}
            onChange={(e) => set("conditions", e.target.value)}
            placeholder={t("intake.step2.conditionsPlaceholder")}
          />
        </Field>

        <Field id="currentlyWorking" label={t("intake.step2.currentlyWorking")}>
          <YesNo
            value={state.currentlyWorking}
            onChange={(v) => set("currentlyWorking", v)}
          />
        </Field>

        {state.currentlyWorking === "yes" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="hoursPerWeek"
              label={t("intake.step2.workingHoursPerWeek")}
            >
              <Input
                id="hoursPerWeek"
                value={state.workingHoursPerWeek}
                onChange={(e) => set("workingHoursPerWeek", e.target.value)}
                inputMode="numeric"
              />
            </Field>
            <Field id="earnings" label={t("intake.step2.monthlyEarnings")}>
              <Input
                id="earnings"
                value={state.monthlyEarnings}
                onChange={(e) => set("monthlyEarnings", e.target.value)}
                placeholder="$"
              />
            </Field>
          </div>
        )}

        <Field id="filedBefore" label={t("intake.step2.filedBefore")}>
          <YesNo
            value={state.filedBefore}
            onChange={(v) => set("filedBefore", v)}
            yesLabel={t("intake.step2.filedBeforeYes")}
            noLabel={t("intake.step2.filedBeforeNo")}
          />
        </Field>

        <Field id="benefitType" label={t("intake.step2.benefitType")}>
          <div className="grid gap-2">
            {(
              [
                ["ssdi", t("intake.step2.benefitSSDI")],
                ["ssi", t("intake.step2.benefitSSI")],
                ["both", t("intake.step2.benefitBoth")],
                ["unsure", t("intake.step2.benefitUnsure")],
              ] as const
            ).map(([value, label]) => {
              const active = state.benefitType === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => set("benefitType", value)}
                  className={cn(
                    "rounded-md border px-4 py-3 text-left text-sm transition-colors duration-200",
                    active
                      ? "border-transparent text-white"
                      : "border-border bg-white text-foreground hover:border-[#CCC]",
                  )}
                  style={active ? { backgroundColor: BRAND } : undefined}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </Field>
      </CardContent>
    </>
  );
}

// ─── Step 3: Providers ─────────────────────────────────────────────────

function Step3({
  providers,
  onChange,
}: {
  providers: Provider[];
  onChange: (p: Provider[]) => void;
}) {
  const { t } = useTranslation();

  function addProvider() {
    onChange([
      ...providers,
      { name: "", specialty: "", phone: "", city: "", lastVisit: "" },
    ]);
  }

  function removeProvider(index: number) {
    onChange(providers.filter((_, i) => i !== index));
  }

  function updateProvider(index: number, patch: Partial<Provider>) {
    onChange(providers.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  return (
    <>
      <CardHeader>
        <CardTitle style={{ color: BRAND }}>
          {t("intake.step3.title")}
        </CardTitle>
        <CardDescription>{t("intake.step3.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {providers.length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-white px-4 py-6 text-center text-sm text-muted-foreground">
            {t("intake.step3.noProvidersYet")}
          </div>
        ) : (
          providers.map((p, i) => (
            <div
              key={i}
              className="space-y-3 rounded-md border border-border bg-white p-4"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  #{i + 1}
                </span>
                <button
                  type="button"
                  onClick={() => removeProvider(i)}
                  className="text-xs font-medium text-[#CC0000] hover:underline"
                >
                  {t("intake.step3.removeProvider")}
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  id={`provider-name-${i}`}
                  label={t("intake.step3.providerName")}
                >
                  <Input
                    id={`provider-name-${i}`}
                    value={p.name}
                    onChange={(e) =>
                      updateProvider(i, { name: e.target.value })
                    }
                  />
                </Field>
                <Field
                  id={`provider-specialty-${i}`}
                  label={t("intake.step3.providerSpecialty")}
                >
                  <Input
                    id={`provider-specialty-${i}`}
                    value={p.specialty}
                    onChange={(e) =>
                      updateProvider(i, { specialty: e.target.value })
                    }
                  />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field
                  id={`provider-phone-${i}`}
                  label={t("intake.step3.providerPhone")}
                >
                  <Input
                    id={`provider-phone-${i}`}
                    type="tel"
                    value={p.phone}
                    onChange={(e) =>
                      updateProvider(i, { phone: e.target.value })
                    }
                  />
                </Field>
                <Field
                  id={`provider-city-${i}`}
                  label={t("intake.step3.providerCity")}
                >
                  <Input
                    id={`provider-city-${i}`}
                    value={p.city}
                    onChange={(e) =>
                      updateProvider(i, { city: e.target.value })
                    }
                  />
                </Field>
                <Field
                  id={`provider-last-${i}`}
                  label={t("intake.step3.providerLastVisit")}
                >
                  <Input
                    id={`provider-last-${i}`}
                    value={p.lastVisit}
                    onChange={(e) =>
                      updateProvider(i, { lastVisit: e.target.value })
                    }
                    placeholder="MM/YYYY"
                  />
                </Field>
              </div>
            </div>
          ))
        )}
        <p className="text-xs text-muted-foreground">
          {t("intake.step3.providerHelp")}
        </p>
        <Button type="button" variant="outline" onClick={addProvider}>
          + {t("intake.step3.addProvider")}
        </Button>
      </CardContent>
    </>
  );
}

// ─── Step 4: Work history ──────────────────────────────────────────────

function Step4({
  jobs,
  onChange,
}: {
  jobs: Job[];
  onChange: (jobs: Job[]) => void;
}) {
  const { t } = useTranslation();

  function addJob() {
    if (jobs.length >= 5) return;
    onChange([
      ...jobs,
      {
        employer: "",
        jobTitle: "",
        startDate: "",
        endDate: "",
        currentJob: false,
        duties: "",
      },
    ]);
  }

  function removeJob(index: number) {
    onChange(jobs.filter((_, i) => i !== index));
  }

  function updateJob(index: number, patch: Partial<Job>) {
    onChange(jobs.map((j, i) => (i === index ? { ...j, ...patch } : j)));
  }

  return (
    <>
      <CardHeader>
        <CardTitle style={{ color: BRAND }}>
          {t("intake.step4.title")}
        </CardTitle>
        <CardDescription>{t("intake.step4.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {jobs.length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-white px-4 py-6 text-center text-sm text-muted-foreground">
            {t("intake.step4.noJobsYet")}
          </div>
        ) : (
          jobs.map((j, i) => (
            <div
              key={i}
              className="space-y-3 rounded-md border border-border bg-white p-4"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  #{i + 1}
                </span>
                <button
                  type="button"
                  onClick={() => removeJob(i)}
                  className="text-xs font-medium text-[#CC0000] hover:underline"
                >
                  {t("intake.step4.removeJob")}
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  id={`job-employer-${i}`}
                  label={t("intake.step4.employer")}
                >
                  <Input
                    id={`job-employer-${i}`}
                    value={j.employer}
                    onChange={(e) => updateJob(i, { employer: e.target.value })}
                  />
                </Field>
                <Field id={`job-title-${i}`} label={t("intake.step4.jobTitle")}>
                  <Input
                    id={`job-title-${i}`}
                    value={j.jobTitle}
                    onChange={(e) => updateJob(i, { jobTitle: e.target.value })}
                  />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  id={`job-start-${i}`}
                  label={t("intake.step4.startDate")}
                >
                  <Input
                    id={`job-start-${i}`}
                    value={j.startDate}
                    onChange={(e) =>
                      updateJob(i, { startDate: e.target.value })
                    }
                    placeholder="MM/YYYY"
                  />
                </Field>
                <Field id={`job-end-${i}`} label={t("intake.step4.endDate")}>
                  <Input
                    id={`job-end-${i}`}
                    value={j.endDate}
                    onChange={(e) => updateJob(i, { endDate: e.target.value })}
                    placeholder="MM/YYYY"
                    disabled={j.currentJob}
                  />
                </Field>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={j.currentJob}
                  onCheckedChange={(v) =>
                    updateJob(i, { currentJob: v === true })
                  }
                />
                {t("intake.step4.currentJob")}
              </label>
              <Field id={`job-duties-${i}`} label={t("intake.step4.duties")}>
                <Textarea
                  id={`job-duties-${i}`}
                  rows={3}
                  value={j.duties}
                  onChange={(e) => updateJob(i, { duties: e.target.value })}
                  placeholder={t("intake.step4.dutiesPlaceholder")}
                />
              </Field>
            </div>
          ))
        )}
        <Button
          type="button"
          variant="outline"
          onClick={addJob}
          disabled={jobs.length >= 5}
        >
          + {t("intake.step4.addJob")}
        </Button>
      </CardContent>
    </>
  );
}

// ─── Step 5: Review ────────────────────────────────────────────────────

function Step5({
  state,
  errors,
  onConsentChange,
}: {
  state: FormState;
  errors: Record<string, string>;
  onConsentChange: (consent: boolean) => void;
}) {
  const { t } = useTranslation();

  const personal = state.personal;
  const disability = state.disability;

  const none = t("intake.step5.noneProvided");

  return (
    <>
      <CardHeader>
        <CardTitle style={{ color: BRAND }}>
          {t("intake.step5.title")}
        </CardTitle>
        <CardDescription>{t("intake.step5.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <ReviewBlock title={t("intake.step5.personalInfo")}>
          <dl className="grid gap-2 text-sm">
            <ReviewRow
              label={t("intake.step1.firstName")}
              value={personal.firstName || none}
            />
            <ReviewRow
              label={t("intake.step1.lastName")}
              value={personal.lastName || none}
            />
            <ReviewRow
              label={t("intake.step1.dateOfBirth")}
              value={personal.dateOfBirth || none}
            />
            <ReviewRow
              label={t("intake.step1.email")}
              value={personal.email || none}
            />
            <ReviewRow
              label={t("intake.step1.phone")}
              value={personal.phone || none}
            />
          </dl>
        </ReviewBlock>

        <ReviewBlock title={t("intake.step5.disability")}>
          <dl className="grid gap-2 text-sm">
            <ReviewRow
              label={t("intake.step2.disabilityStartDate")}
              value={disability.disabilityStartDate || none}
            />
            <ReviewRow
              label={t("intake.step2.conditions")}
              value={disability.conditions || none}
            />
            <ReviewRow
              label={t("intake.step2.currentlyWorking")}
              value={
                disability.currentlyWorking === "yes"
                  ? t("common.yes")
                  : disability.currentlyWorking === "no"
                    ? t("common.no")
                    : none
              }
            />
            <ReviewRow
              label={t("intake.step2.benefitType")}
              value={disability.benefitType || none}
            />
          </dl>
        </ReviewBlock>

        <ReviewBlock title={t("intake.step5.providers")}>
          {state.providers.length === 0 ? (
            <p className="text-sm text-muted-foreground">{none}</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {state.providers.map((p, i) => (
                <li key={i}>
                  <span className="font-medium">{p.name || "—"}</span>
                  {p.specialty ? ` · ${p.specialty}` : ""}
                </li>
              ))}
            </ul>
          )}
        </ReviewBlock>

        <ReviewBlock title={t("intake.step5.workHistory")}>
          {state.workHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">{none}</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {state.workHistory.map((j, i) => (
                <li key={i}>
                  <span className="font-medium">{j.employer || "—"}</span>
                  {j.jobTitle ? ` · ${j.jobTitle}` : ""}
                </li>
              ))}
            </ul>
          )}
        </ReviewBlock>

        <div className="rounded-md border border-border bg-white p-4">
          <h3 className="mb-2 text-sm font-semibold" style={{ color: BRAND }}>
            {t("intake.step5.consentTitle")}
          </h3>
          <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
            {t("intake.step5.consentText")}
          </p>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={state.consent}
              onCheckedChange={(v) => onConsentChange(v === true)}
              className="mt-0.5"
            />
            <span>{t("intake.step5.consentCheckbox")}</span>
          </label>
          {errors.consent ? (
            <p className="mt-2 text-xs text-[#CC0000]">{errors.consent}</p>
          ) : null}
        </div>
      </CardContent>
    </>
  );
}

// ─── Success ───────────────────────────────────────────────────────────

function SuccessView({ referenceNumber }: { referenceNumber: string }) {
  const { t } = useTranslation();
  return (
    <div className="mx-auto w-full max-w-[640px] px-4 py-16 text-center">
      <div
        className="mx-auto mb-6 inline-flex h-14 w-14 items-center justify-center rounded-full text-white"
        style={{ backgroundColor: "#1d72b8" }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
      <h1
        className="mb-3 text-2xl font-semibold tracking-tight"
        style={{ color: BRAND }}
      >
        {t("intake.success.title")}
      </h1>
      <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
        {t("intake.success.message")}
      </p>
      <div className="inline-flex items-center gap-2 rounded-md border border-border bg-white px-4 py-2 text-sm">
        <span className="text-muted-foreground">
          {t("intake.success.referenceNumber")}:
        </span>
        <span className="font-mono font-semibold">{referenceNumber}</span>
      </div>
    </div>
  );
}

// ─── Small primitives ──────────────────────────────────────────────────

function Field({
  id,
  label,
  required,
  help,
  error,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  help?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-foreground">
        {label}
        {required ? <span className="ml-1 text-[#CC0000]">*</span> : null}
      </Label>
      {children}
      {help && !error ? (
        <p className="text-xs text-muted-foreground">{help}</p>
      ) : null}
      {error ? <p className="text-xs text-[#CC0000]">{error}</p> : null}
    </div>
  );
}

function YesNo({
  value,
  onChange,
  yesLabel,
  noLabel,
}: {
  value: "yes" | "no" | "";
  onChange: (v: "yes" | "no") => void;
  yesLabel?: string;
  noLabel?: string;
}) {
  const { t } = useTranslation();
  const yes = yesLabel ?? t("common.yes");
  const no = noLabel ?? t("common.no");

  return (
    <div className="flex gap-2">
      {(
        [
          ["yes", yes],
          ["no", no],
        ] as const
      ).map(([v, label]) => {
        const active = value === v;
        return (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className={cn(
              "flex-1 rounded-md border px-4 py-2 text-sm transition-colors duration-200",
              active
                ? "border-transparent text-white"
                : "border-border bg-white text-foreground hover:border-[#CCC]",
            )}
            style={active ? { backgroundColor: BRAND } : undefined}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Accessible pill-style radio group. Uses ARIA composite roles
 * (`role="radiogroup"` + `role="radio"` buttons with `aria-checked`).
 * Supports arrow-key navigation (Left/Right/Up/Down) and Home/End,
 * and space/enter to select the focused option.
 */
function PillRadioGroup({
  ariaLabelledBy,
  value,
  onChange,
  options,
  className,
  optionClassName,
  activeStyle,
}: {
  ariaLabelledBy?: string;
  ariaLabel?: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  className?: string;
  optionClassName: (active: boolean) => string;
  activeStyle?: React.CSSProperties;
}) {
  const containerRef = React.useRef<HTMLDivElement>(null);

  function focusSibling(currentIndex: number, delta: number) {
    const next = (currentIndex + delta + options.length) % options.length;
    const nodes = containerRef.current?.querySelectorAll<HTMLButtonElement>(
      '[role="radio"]',
    );
    nodes?.[next]?.focus();
  }

  function handleKeyDown(
    e: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        e.preventDefault();
        focusSibling(index, 1);
        onChange(
          options[(index + 1 + options.length) % options.length].value,
        );
        break;
      case "ArrowLeft":
      case "ArrowUp":
        e.preventDefault();
        focusSibling(index, -1);
        onChange(
          options[(index - 1 + options.length) % options.length].value,
        );
        break;
      case "Home":
        e.preventDefault();
        focusSibling(index, -index);
        onChange(options[0].value);
        break;
      case "End":
        e.preventDefault();
        focusSibling(index, options.length - 1 - index);
        onChange(options[options.length - 1].value);
        break;
      case " ":
      case "Enter":
        e.preventDefault();
        onChange(options[index].value);
        break;
    }
  }

  return (
    <div
      ref={containerRef}
      role="radiogroup"
      aria-labelledby={ariaLabelledBy}
      className={className}
    >
      {options.map((opt, index) => {
        const active = value === opt.value;
        // Roving tabindex: only the selected option (or first option if none
        // selected) is tabbable. Arrow keys move focus within the group.
        const isTabbable = active || (!value && index === 0);
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={isTabbable ? 0 : -1}
            onClick={() => onChange(opt.value)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            className={optionClassName(active)}
            style={active ? activeStyle : undefined}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function ReviewBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <div className="rounded-md border border-border bg-white p-3">
        {children}
      </div>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-words">{value}</dd>
    </div>
  );
}

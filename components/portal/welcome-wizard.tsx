"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";
import {
  setPortalLocale,
  submitWelcomeFirstMessage,
  updateContactPortalProfile,
} from "@/app/actions/portal-profile";
import { type Locale } from "@/lib/i18n/messages";
import { getTranslation } from "@/lib/i18n/getTranslation";
import { cn } from "@/lib/utils";

type Channel = "email" | "phone" | "text";

export type WelcomeWizardStageGroup = {
  id: string;
  name: string;
  displayOrder: number;
  clientVisibleName: string | null;
  clientVisibleDescription: string | null;
};

export type WelcomeWizardProfile = {
  name: string;
  dob: string | null;
  ssnMasked: string | null;
  phone: string;
  email: string;
  preferredChannel: Channel;
};

export type WelcomeWizardProps = {
  locale: Locale;
  firstName: string;
  initialProfile: WelcomeWizardProfile;
  stageGroups: WelcomeWizardStageGroup[];
  isImpersonating: boolean;
  hasPrimaryCase: boolean;
};

/** Keyed to the stage group display order (0..4). Matches the 5-phase default. */
const STAGE_GROUP_FALLBACK_KEYS = [
  "intake",
  "application",
  "reconsideration",
  "hearing",
  "decision",
] as const;

const TOTAL_SCREENS = 4;

export function WelcomeWizard(props: WelcomeWizardProps) {
  const router = useRouter();
  const [localeState, setLocaleState] = useState<Locale>(props.locale);
  const t = useMemo(() => getTranslation(localeState), [localeState]);

  const [step, setStep] = useState(1);
  const [profile, setProfile] = useState<WelcomeWizardProfile>(
    props.initialProfile,
  );
  const [profileError, setProfileError] = useState<string | null>(null);
  const [firstMessage, setFirstMessage] = useState("");
  const [messageError, setMessageError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">(
    "idle",
  );
  const [isPending, startTransition] = useTransition();

  const readOnly = props.isImpersonating;

  function goNext() {
    if (step < TOTAL_SCREENS) setStep((s) => s + 1);
  }
  function goBack() {
    if (step > 1) setStep((s) => s - 1);
  }

  function handleLocaleChange(next: Locale) {
    setLocaleState(next);
    if (readOnly) return;
    startTransition(async () => {
      await setPortalLocale(next);
      router.refresh();
    });
  }

  function persistProfile(nextStep: number) {
    if (readOnly) {
      setStep(nextStep);
      return;
    }
    setSaveStatus("saving");
    setProfileError(null);
    startTransition(async () => {
      const result = await updateContactPortalProfile({
        phone: profile.phone,
        email: profile.email,
        preferredChannel: profile.preferredChannel,
      });
      if (!result.ok) {
        setSaveStatus("idle");
        setProfileError(
          result.error === "Invalid email"
            ? t("intake.validation.invalidEmail")
            : t("portal.welcome.screen2.saveError"),
        );
        return;
      }
      setSaveStatus("saved");
      setStep(nextStep);
    });
  }

  function finishWizard() {
    const trimmed = firstMessage.trim();
    if (trimmed.length === 0 || readOnly) {
      router.push("/portal");
      router.refresh();
      return;
    }
    setMessageError(null);
    startTransition(async () => {
      const result = await submitWelcomeFirstMessage(trimmed);
      if (!result.ok) {
        setMessageError(t("portal.welcome.screen4.sendingError"));
        return;
      }
      router.push("/portal");
      router.refresh();
    });
  }

  return (
    <div className="mx-auto w-full max-w-xl space-y-6">
      <ProgressBar step={step} total={TOTAL_SCREENS} t={t} />

      {step === 1 ? (
        <ScreenShell
          title={t("portal.welcome.screen1.title", {
            firstName: props.firstName || "there",
          })}
          subtitle={t("portal.welcome.screen1.subtitle")}
        >
          <fieldset className="space-y-3">
            <legend className="text-[14px] font-medium text-foreground/80">
              {t("portal.welcome.screen1.languageLabel")}
            </legend>
            <div className="inline-flex rounded-full bg-[#F0EBE3] p-1">
              <LocaleButton
                active={localeState === "en"}
                disabled={readOnly || isPending}
                onClick={() => handleLocaleChange("en")}
              >
                {t("portal.welcome.screen1.english")}
              </LocaleButton>
              <LocaleButton
                active={localeState === "es"}
                disabled={readOnly || isPending}
                onClick={() => handleLocaleChange("es")}
              >
                {t("portal.welcome.screen1.spanish")}
              </LocaleButton>
            </div>
          </fieldset>
        </ScreenShell>
      ) : null}

      {step === 2 ? (
        <ScreenShell
          title={t("portal.welcome.screen2.title")}
          subtitle={t("portal.welcome.screen2.subtitle")}
        >
          <ProfileForm
            profile={profile}
            onChange={setProfile}
            readOnly={readOnly}
            t={t}
          />
          <p className="text-[13px] text-foreground/60">
            {t("portal.welcome.screen2.readOnlyHint")}
          </p>
          {profileError ? (
            <p role="alert" className="text-[13px] text-red-600">
              {profileError}
            </p>
          ) : null}
        </ScreenShell>
      ) : null}

      {step === 3 ? (
        <ScreenShell
          title={t("portal.welcome.screen3.title")}
          subtitle={t("portal.welcome.screen3.subtitle")}
        >
          <StageGroupScroller
            stageGroups={props.stageGroups}
            locale={localeState}
            t={t}
          />
          <p className="mt-1 text-center text-[12px] italic text-foreground/50">
            {t("portal.welcome.screen3.swipeHint")}
          </p>
        </ScreenShell>
      ) : null}

      {step === 4 ? (
        <ScreenShell
          title={t("portal.welcome.screen4.title")}
          subtitle={t("portal.welcome.screen4.subtitle")}
        >
          <label className="block text-[14px] font-medium text-foreground/80">
            {t("portal.welcome.screen4.firstMessageLabel")}
            <textarea
              value={firstMessage}
              onChange={(event) => setFirstMessage(event.target.value)}
              placeholder={t("portal.welcome.screen4.firstMessagePlaceholder")}
              disabled={readOnly}
              rows={4}
              className="mt-2 w-full rounded-2xl border border-[#E8E2D8] bg-white px-3 py-2 text-[15px] text-foreground shadow-sm focus:border-[#104e60] focus:outline-none focus:ring-2 focus:ring-[#104e60]/20 disabled:bg-[#F0EBE3] disabled:text-foreground/60"
            />
          </label>
          {messageError ? (
            <p role="alert" className="text-[13px] text-red-600">
              {messageError}
            </p>
          ) : null}
        </ScreenShell>
      ) : null}

      <WizardFooter
        step={step}
        total={TOTAL_SCREENS}
        onBack={goBack}
        onNext={() => {
          if (step === 2) {
            persistProfile(3);
            return;
          }
          goNext();
        }}
        onFinish={finishWizard}
        isPending={isPending || saveStatus === "saving"}
        saveStatus={saveStatus}
        firstMessageSet={firstMessage.trim().length > 0}
        hasPrimaryCase={props.hasPrimaryCase}
        t={t}
      />
    </div>
  );
}

function ProgressBar({
  step,
  total,
  t,
}: {
  step: number;
  total: number;
  t: ReturnType<typeof getTranslation>;
}) {
  return (
    <div>
      <p className="text-[12px] font-medium uppercase tracking-wide text-foreground/60">
        {t("portal.welcome.stepOf", { current: step, total })}
      </p>
      <div
        className="mt-2 flex gap-1.5"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={step}
      >
        {Array.from({ length: total }, (_, i) => (
          <span
            key={`progress-${i}`}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors",
              i < step ? "bg-[#104e60]" : "bg-[#E8E2D8]",
            )}
          />
        ))}
      </div>
    </div>
  );
}

function ScreenShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-2xl bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)] ring-1 ring-[#E8E2D8] sm:p-8">
      <header className="space-y-2">
        <h1 className="text-[24px] font-semibold tracking-tight text-foreground sm:text-[28px]">
          {title}
        </h1>
        <p className="text-[17px] leading-relaxed text-foreground/70">
          {subtitle}
        </p>
      </header>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function LocaleButton({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-full px-4 py-1.5 text-[14px] font-medium transition-colors",
        active
          ? "bg-white text-foreground shadow-sm"
          : "text-foreground/60 hover:text-foreground",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      {children}
    </button>
  );
}

function ProfileForm({
  profile,
  onChange,
  readOnly,
  t,
}: {
  profile: WelcomeWizardProfile;
  onChange: (next: WelcomeWizardProfile) => void;
  readOnly: boolean;
  t: ReturnType<typeof getTranslation>;
}) {
  const dobDisplay = profile.dob
    ? new Date(profile.dob).toLocaleDateString()
    : "—";

  return (
    <div className="space-y-4">
      <ReadOnlyField label={t("portal.welcome.screen2.nameLabel")}>
        {profile.name || "—"}
      </ReadOnlyField>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ReadOnlyField label={t("portal.welcome.screen2.dobLabel")}>
          {dobDisplay}
        </ReadOnlyField>
        <ReadOnlyField label={t("portal.welcome.screen2.ssnLabel")}>
          {profile.ssnMasked ?? "—"}
        </ReadOnlyField>
      </div>

      <label className="block text-[14px] font-medium text-foreground/80">
        {t("portal.welcome.screen2.phoneLabel")}
        <input
          type="tel"
          value={profile.phone}
          disabled={readOnly}
          onChange={(event) =>
            onChange({ ...profile, phone: event.target.value })
          }
          className="mt-1 w-full rounded-2xl border border-[#E8E2D8] bg-white px-3 py-2 text-[15px] shadow-sm focus:border-[#104e60] focus:outline-none focus:ring-2 focus:ring-[#104e60]/20 disabled:bg-[#F0EBE3]"
        />
      </label>

      <label className="block text-[14px] font-medium text-foreground/80">
        {t("portal.welcome.screen2.emailLabel")}
        <input
          type="email"
          value={profile.email}
          disabled={readOnly}
          onChange={(event) =>
            onChange({ ...profile, email: event.target.value })
          }
          className="mt-1 w-full rounded-2xl border border-[#E8E2D8] bg-white px-3 py-2 text-[15px] shadow-sm focus:border-[#104e60] focus:outline-none focus:ring-2 focus:ring-[#104e60]/20 disabled:bg-[#F0EBE3]"
        />
      </label>

      <fieldset className="space-y-2">
        <legend className="text-[14px] font-medium text-foreground/80">
          {t("portal.welcome.screen2.preferredChannelLabel")}
        </legend>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["email", "portal.welcome.screen2.channelEmail"],
              ["phone", "portal.welcome.screen2.channelPhone"],
              ["text", "portal.welcome.screen2.channelText"],
            ] as const
          ).map(([value, labelKey]) => {
            const active = profile.preferredChannel === value;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={active}
                disabled={readOnly}
                onClick={() =>
                  onChange({ ...profile, preferredChannel: value })
                }
                className={cn(
                  "rounded-full border px-4 py-1.5 text-[13px] font-medium transition-colors",
                  active
                    ? "border-[#104e60] bg-[#104e60] text-white"
                    : "border-[#E8E2D8] bg-white text-foreground/70 hover:border-[#104e60]/40",
                  readOnly && "cursor-not-allowed opacity-60",
                )}
              >
                {t(labelKey)}
              </button>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}

function ReadOnlyField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-[12px] font-medium uppercase tracking-wide text-foreground/60">
        {label}
      </p>
      <p className="mt-1 text-[16px] text-foreground">{children}</p>
    </div>
  );
}

function StageGroupScroller({
  stageGroups,
  locale,
  t,
}: {
  stageGroups: WelcomeWizardStageGroup[];
  locale: Locale;
  t: ReturnType<typeof getTranslation>;
}) {
  const cards = useMemo(() => {
    // Slice to 5 so the horizontal layout stays predictable even if the org
    // over-configured. If an org configured fewer, fill from fallbacks.
    const real = stageGroups.slice(0, 5);
    while (real.length < 5) {
      real.push({
        id: `fallback-${real.length}`,
        name: "",
        displayOrder: real.length,
        clientVisibleName: null,
        clientVisibleDescription: null,
      });
    }
    return real.map((group, index) => {
      const fallbackKey =
        STAGE_GROUP_FALLBACK_KEYS[index] ?? STAGE_GROUP_FALLBACK_KEYS[0];
      const name =
        group.clientVisibleName?.trim() ||
        group.name ||
        t(`portal.stageGroupDefaults.${fallbackKey}.name`);
      const description =
        group.clientVisibleDescription?.trim() ||
        t(`portal.stageGroupDefaults.${fallbackKey}.description`);
      return { id: group.id, name, description };
    });
  }, [stageGroups, t, locale]);

  return (
    <div className="-mx-2 overflow-x-auto pb-2">
      <ul className="flex snap-x snap-mandatory gap-4 px-2">
        {cards.map((card, index) => (
          <li
            key={card.id}
            className="min-w-[75%] snap-start rounded-2xl bg-[#F7F5F2] p-5 ring-1 ring-[#E8E2D8] sm:min-w-[45%]"
          >
            <p className="text-[12px] font-medium uppercase tracking-wide text-[#104e60]">
              {index + 1}
            </p>
            <h3 className="mt-1 text-[17px] font-semibold text-foreground">
              {card.name}
            </h3>
            <p className="mt-2 text-[15px] leading-relaxed text-foreground/70">
              {card.description}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function WizardFooter({
  step,
  total,
  onBack,
  onNext,
  onFinish,
  isPending,
  saveStatus,
  firstMessageSet,
  hasPrimaryCase,
  t,
}: {
  step: number;
  total: number;
  onBack: () => void;
  onNext: () => void;
  onFinish: () => void;
  isPending: boolean;
  saveStatus: "idle" | "saving" | "saved";
  firstMessageSet: boolean;
  hasPrimaryCase: boolean;
  t: ReturnType<typeof getTranslation>;
}) {
  const isLast = step === total;

  return (
    <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
      <button
        type="button"
        onClick={onBack}
        disabled={step === 1 || isPending}
        className="inline-flex items-center justify-center gap-2 rounded-full border border-[#E8E2D8] bg-white px-4 py-2 text-[14px] font-medium text-foreground/80 hover:border-[#CCC] disabled:opacity-50"
      >
        <ChevronLeft className="size-4" />
        {t("portal.welcome.back")}
      </button>

      {isLast ? (
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={onFinish}
            disabled={isPending || !hasPrimaryCase}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[#104e60] px-5 py-2.5 text-[15px] font-semibold text-white shadow-sm hover:bg-[#0d3f4e] disabled:opacity-60"
          >
            {firstMessageSet
              ? t("portal.welcome.screen4.sendFirstMessage")
              : t("portal.welcome.finish")}
            <ChevronRight className="size-4" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          {saveStatus === "saved" ? (
            <span className="inline-flex items-center gap-1 text-[13px] text-foreground/60">
              <Check className="size-3.5" />
              {t("common.saved")}
            </span>
          ) : null}
          <button
            type="button"
            onClick={onNext}
            disabled={isPending}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[#104e60] px-5 py-2.5 text-[15px] font-semibold text-white shadow-sm hover:bg-[#0d3f4e] disabled:opacity-60"
          >
            {t("portal.welcome.next")}
            <ChevronRight className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}

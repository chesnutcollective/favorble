/**
 * Intake form translations (Wave 5).
 *
 * Focused, flat translation dictionary for the lead creation / intake form.
 * 35% of Hogan Smith's leads are Spanish-speaking, so every user-facing
 * string in the intake form must have an `es` entry.
 *
 * Spanish register: formal ("usted", "su", "sus") — this is a legal context.
 *
 * A broader nested translation tree lives at `lib/i18n/messages.ts`. This
 * module is deliberately a simple flat map so components can do:
 *
 *   const label = t(locale, "firstName");
 */

export type Locale = "en" | "es";

export const SUPPORTED_LOCALES: Locale[] = ["en", "es"];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_STORAGE_KEY = "intake-locale";

export const intakeFormTranslations = {
  en: {
    // Form chrome
    formTitle: "New Lead",
    formDescription: "Enter the lead contact information.",
    languageLabel: "Language",
    english: "English",
    spanish: "Español",

    // Core identity fields
    firstName: "First Name",
    lastName: "Last Name",
    email: "Email Address",
    phone: "Phone Number",
    dateOfBirth: "Date of Birth",

    // Placeholders
    firstNamePlaceholder: "First name",
    lastNamePlaceholder: "Last name",
    emailPlaceholder: "email@example.com",
    phonePlaceholder: "(555) 123-4567",
    dateOfBirthPlaceholder: "MM/DD/YYYY",

    // Disability / intake fields
    disabilityType: "Type of Disability",
    disabilityTypePlaceholder: "e.g. Back injury, Depression, Heart condition",
    workHistory: "Work History",
    workHistoryPlaceholder: "Describe your most recent jobs and why you stopped working.",
    currentlyWorking: "Currently Working?",
    priorClaims: "Have you filed prior disability claims?",
    yes: "Yes",
    no: "No",
    unsure: "I'm not sure",

    // Source / notes
    source: "Source",
    notes: "Notes",
    notesPlaceholder: "Any additional context…",

    // Buttons
    submitButton: "Submit Application",
    createLead: "Create Lead",
    creating: "Creating…",
    cancel: "Cancel",
    viewLead: "View",
    markAsDuplicate: "Mark as duplicate",

    // Duplicate warnings
    duplicateWarning: "We found possible matches",
    duplicateWarningSingle: "1 possible duplicate found",
    duplicateWarningMany: "{count} possible duplicates found",
    duplicateHelp:
      "Review the matches below before creating a new lead. Merging keeps the primary record and links any notes.",
    daysAgo: "{count}d ago",
    confidence: "{percent}% match",
    matchReasonExactEmail: "Exact email match",
    matchReasonExactPhone: "Exact phone match",
    matchReasonNameDob: "Same name and date of birth",
    matchReasonNameDomain: "Same name and email domain",
    matchReasonFuzzy: "Similar name and same area code",

    // Validation
    requiredField: "Required",
    invalidEmail: "Please enter a valid email",
    invalidPhone: "Please enter a valid phone number",
  },
  es: {
    // Form chrome
    formTitle: "Nuevo Prospecto",
    formDescription: "Ingrese la información de contacto del prospecto.",
    languageLabel: "Idioma",
    english: "English",
    spanish: "Español",

    // Core identity fields
    firstName: "Nombre",
    lastName: "Apellido",
    email: "Correo Electrónico",
    phone: "Número de Teléfono",
    dateOfBirth: "Fecha de Nacimiento",

    // Placeholders
    firstNamePlaceholder: "Nombre",
    lastNamePlaceholder: "Apellido",
    emailPlaceholder: "correo@ejemplo.com",
    phonePlaceholder: "(555) 123-4567",
    dateOfBirthPlaceholder: "DD/MM/AAAA",

    // Disability / intake fields
    disabilityType: "Tipo de Discapacidad",
    disabilityTypePlaceholder:
      "ej. Lesión de espalda, Depresión, Condición cardíaca",
    workHistory: "Historia Laboral",
    workHistoryPlaceholder:
      "Describa sus trabajos más recientes y por qué dejó de trabajar.",
    currentlyWorking: "¿Trabaja Actualmente?",
    priorClaims: "¿Ha presentado solicitudes de discapacidad anteriores?",
    yes: "Sí",
    no: "No",
    unsure: "No estoy seguro",

    // Source / notes
    source: "Origen",
    notes: "Notas",
    notesPlaceholder: "Cualquier contexto adicional…",

    // Buttons
    submitButton: "Enviar Solicitud",
    createLead: "Crear Prospecto",
    creating: "Creando…",
    cancel: "Cancelar",
    viewLead: "Ver",
    markAsDuplicate: "Marcar como duplicado",

    // Duplicate warnings
    duplicateWarning: "Encontramos posibles coincidencias",
    duplicateWarningSingle: "Se encontró 1 posible duplicado",
    duplicateWarningMany: "Se encontraron {count} posibles duplicados",
    duplicateHelp:
      "Revise las coincidencias antes de crear un nuevo prospecto. Al combinar se mantiene el registro principal y se vinculan las notas.",
    daysAgo: "hace {count}d",
    confidence: "{percent}% de coincidencia",
    matchReasonExactEmail: "Coincidencia exacta de correo",
    matchReasonExactPhone: "Coincidencia exacta de teléfono",
    matchReasonNameDob: "Mismo nombre y fecha de nacimiento",
    matchReasonNameDomain: "Mismo nombre y dominio de correo",
    matchReasonFuzzy: "Nombre similar y mismo código de área",

    // Validation
    requiredField: "Obligatorio",
    invalidEmail: "Por favor ingrese un correo válido",
    invalidPhone: "Por favor ingrese un número de teléfono válido",
  },
} as const;

export type IntakeFormKey = keyof typeof intakeFormTranslations.en;

/**
 * Look up a translated string for the given locale. Falls back to English if
 * the key is missing from the target locale (shouldn't happen, but defensive).
 */
export function t(locale: Locale, key: IntakeFormKey): string {
  const dict = intakeFormTranslations[locale] ?? intakeFormTranslations.en;
  return dict[key] ?? intakeFormTranslations.en[key];
}

/**
 * Substitute `{placeholder}` tokens in a translated string.
 *
 *   tf("en", "duplicateWarningMany", { count: 3 }) -> "3 possible duplicates found"
 */
export function tf(
  locale: Locale,
  key: IntakeFormKey,
  vars: Record<string, string | number>,
): string {
  let out = t(locale, key);
  for (const [k, v] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
  }
  return out;
}

/**
 * Read the saved locale from localStorage. Safe to call on the server (returns
 * the default); intended for client components.
 */
export function readSavedLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  try {
    const saved = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (saved === "en" || saved === "es") return saved;
  } catch {
    // ignore
  }
  return DEFAULT_LOCALE;
}

/**
 * Persist the selected locale to localStorage.
 */
export function saveLocale(locale: Locale): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // ignore
  }
}

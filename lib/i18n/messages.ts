/**
 * Translation messages for Favorble client-facing intake forms.
 *
 * Supported locales:
 *   - en: English (default)
 *   - es: Spanish (formal "usted" — this is a legal context)
 *
 * Key conventions:
 *   - Dotted keys are used when consumed via `t("intake.step1.title")`.
 *   - Keep Spanish translations natural (not literal word-for-word).
 *   - Use formal register ("usted", "su", "sus").
 *   - SSDI / SSI terms follow SSA Spanish publications.
 */

export type Locale = "en" | "es";

export const SUPPORTED_LOCALES: Locale[] = ["en", "es"];
export const DEFAULT_LOCALE: Locale = "en";

// A translation tree is an arbitrarily-nested object of strings.
export type TranslationTree = {
  [key: string]: string | TranslationTree;
};

export const messages: Record<Locale, TranslationTree> = {
  en: {
    common: {
      required: "Required",
      optional: "Optional",
      pleaseSelect: "Please select",
      yes: "Yes",
      no: "No",
      unknown: "I'm not sure",
      loading: "Loading…",
      saving: "Saving…",
      saved: "Saved",
      errorGeneric: "Something went wrong. Please try again.",
      poweredBy: "Powered by Favorble",
      privacyNotice:
        "Your information is confidential and protected by attorney-client privilege. We will never share your information without your consent.",
      languageToggle: "Language",
      english: "English",
      spanish: "Español",
    },
    intake: {
      header: {
        title: "Start Your Disability Claim",
        subtitle:
          "Thank you for contacting us. This intake form helps our team understand your situation so we can represent you effectively.",
        estimatedTime: "Estimated time: 10–15 minutes",
      },
      progress: {
        step: "Step",
        of: "of",
      },
      nav: {
        next: "Next",
        back: "Back",
        submit: "Submit",
        saveDraft: "Save Draft",
        continue: "Continue",
      },
      validation: {
        required: "This field is required",
        invalidEmail: "Please enter a valid email address",
        invalidPhone: "Please enter a valid phone number",
        invalidDate: "Please enter a valid date",
        minLength: "Please enter at least {min} characters",
        ssnFormat: "Please enter the last 4 digits of your SSN",
      },
      step1: {
        title: "Personal Information",
        description:
          "Tell us who you are. We'll use this to open a file and contact you.",
        firstName: "First name",
        lastName: "Last name",
        dateOfBirth: "Date of birth",
        dateOfBirthHelp: "MM/DD/YYYY",
        ssnLast4: "Last 4 digits of Social Security Number",
        ssnLast4Help: "Used to look up your SSA records. Your full SSN is never required.",
        email: "Email address",
        phone: "Phone number",
        phoneHelp: "Best number to reach you during business hours",
        preferredContact: "Preferred contact method",
        contactEmail: "Email",
        contactPhone: "Phone",
        contactText: "Text message",
        address: "Mailing address",
        city: "City",
        state: "State",
        zip: "ZIP code",
      },
      step2: {
        title: "About Your Disability",
        description:
          "Help us understand what is keeping you from working.",
        disabilityStartDate: "When did your disability begin?",
        disabilityStartDateHelp:
          "Enter the approximate date you could no longer work due to your health.",
        conditions: "What medical conditions do you have?",
        conditionsPlaceholder:
          "List each physical or mental health condition, e.g. back pain, depression, diabetes…",
        currentlyWorking: "Are you currently working?",
        workingHoursPerWeek: "If yes, how many hours per week?",
        monthlyEarnings: "Approximate monthly earnings",
        filedBefore: "Have you filed for disability benefits before?",
        filedBeforeYes: "Yes, I filed previously",
        filedBeforeNo: "No, this is my first claim",
        benefitType: "What type of benefit are you applying for?",
        benefitSSDI: "SSDI (Social Security Disability Insurance)",
        benefitSSI: "SSI (Supplemental Security Income)",
        benefitBoth: "Both SSDI and SSI",
        benefitUnsure: "I'm not sure",
      },
      step3: {
        title: "Medical Providers",
        description:
          "List the doctors, clinics, and hospitals that have treated you. We'll request your records from them.",
        addProvider: "Add provider",
        removeProvider: "Remove",
        providerName: "Provider or clinic name",
        providerSpecialty: "Specialty",
        providerPhone: "Phone number",
        providerCity: "City",
        providerLastVisit: "Approximate date of last visit",
        noProvidersYet: "No providers added yet.",
        providerHelp: "Add at least one provider if you have received medical care.",
      },
      step4: {
        title: "Work History",
        description:
          "Tell us about your last 5 jobs. The Social Security Administration uses this to determine what work you can still do.",
        addJob: "Add job",
        removeJob: "Remove",
        employer: "Employer",
        jobTitle: "Job title",
        startDate: "Start date",
        endDate: "End date",
        currentJob: "I still work here",
        duties: "Main duties",
        dutiesPlaceholder: "Briefly describe what you did on a typical day",
        noJobsYet: "No jobs added yet.",
      },
      step5: {
        title: "Review and Submit",
        description:
          "Please review your information below. You can go back to any step to make changes.",
        personalInfo: "Personal Information",
        disability: "Disability Information",
        providers: "Medical Providers",
        workHistory: "Work History",
        noneProvided: "None provided",
        consentTitle: "Consent and Acknowledgment",
        consentText:
          "By submitting this form, I authorize Hogan Smith to contact me regarding my disability claim and to begin gathering the information needed to represent me. I understand that submitting this form does not create an attorney-client relationship until a retainer agreement is signed.",
        consentCheckbox: "I have read and agree to the statement above",
        submitButton: "Submit My Intake",
      },
      success: {
        title: "Thank you — we received your information",
        message:
          "A member of our intake team will review your submission and contact you within one business day. If your situation is urgent, please call our office directly.",
        referenceNumber: "Reference number",
        returnHome: "Return to main site",
      },
    },
    leads: {
      newLead: "New Lead",
      language: "Language",
    },
  },

  es: {
    common: {
      required: "Obligatorio",
      optional: "Opcional",
      pleaseSelect: "Por favor seleccione",
      yes: "Sí",
      no: "No",
      unknown: "No estoy seguro/a",
      loading: "Cargando…",
      saving: "Guardando…",
      saved: "Guardado",
      errorGeneric: "Ocurrió un error. Por favor intente de nuevo.",
      poweredBy: "Desarrollado por Favorble",
      privacyNotice:
        "Su información es confidencial y está protegida por el privilegio abogado-cliente. Nunca compartiremos su información sin su consentimiento.",
      languageToggle: "Idioma",
      english: "English",
      spanish: "Español",
    },
    intake: {
      header: {
        title: "Comience su Reclamo por Incapacidad",
        subtitle:
          "Gracias por comunicarse con nosotros. Este formulario nos ayuda a comprender su situación para poder representarlo eficazmente.",
        estimatedTime: "Tiempo estimado: 10 a 15 minutos",
      },
      progress: {
        step: "Paso",
        of: "de",
      },
      nav: {
        next: "Siguiente",
        back: "Atrás",
        submit: "Enviar",
        saveDraft: "Guardar borrador",
        continue: "Continuar",
      },
      validation: {
        required: "Este campo es obligatorio",
        invalidEmail: "Ingrese una dirección de correo electrónico válida",
        invalidPhone: "Ingrese un número de teléfono válido",
        invalidDate: "Ingrese una fecha válida",
        minLength: "Ingrese al menos {min} caracteres",
        ssnFormat: "Ingrese los últimos 4 dígitos de su Seguro Social",
      },
      step1: {
        title: "Información Personal",
        description:
          "Cuéntenos quién es usted. Usaremos esta información para abrir un expediente y comunicarnos con usted.",
        firstName: "Nombre",
        lastName: "Apellido",
        dateOfBirth: "Fecha de nacimiento",
        dateOfBirthHelp: "MM/DD/AAAA",
        ssnLast4: "Últimos 4 dígitos del Seguro Social",
        ssnLast4Help:
          "Se usan para consultar sus registros del Seguro Social. Nunca pedimos el número completo.",
        email: "Correo electrónico",
        phone: "Número de teléfono",
        phoneHelp:
          "El mejor número para comunicarnos con usted durante horas laborales",
        preferredContact: "Método de contacto preferido",
        contactEmail: "Correo electrónico",
        contactPhone: "Teléfono",
        contactText: "Mensaje de texto",
        address: "Dirección postal",
        city: "Ciudad",
        state: "Estado",
        zip: "Código postal",
      },
      step2: {
        title: "Sobre su Incapacidad",
        description:
          "Ayúdenos a entender qué le impide trabajar.",
        disabilityStartDate: "¿Cuándo comenzó su incapacidad?",
        disabilityStartDateHelp:
          "Ingrese la fecha aproximada en la que ya no pudo trabajar debido a su salud.",
        conditions: "¿Qué condiciones médicas tiene?",
        conditionsPlaceholder:
          "Enumere cada condición física o mental, por ejemplo dolor de espalda, depresión, diabetes…",
        currentlyWorking: "¿Está trabajando actualmente?",
        workingHoursPerWeek: "Si es así, ¿cuántas horas por semana?",
        monthlyEarnings: "Ingresos mensuales aproximados",
        filedBefore: "¿Ha solicitado beneficios por incapacidad anteriormente?",
        filedBeforeYes: "Sí, solicité anteriormente",
        filedBeforeNo: "No, este es mi primer reclamo",
        benefitType: "¿Qué tipo de beneficio está solicitando?",
        benefitSSDI: "SSDI (Seguro de Incapacidad del Seguro Social)",
        benefitSSI: "SSI (Seguridad de Ingreso Suplementario)",
        benefitBoth: "Ambos, SSDI y SSI",
        benefitUnsure: "No estoy seguro/a",
      },
      step3: {
        title: "Proveedores Médicos",
        description:
          "Enumere los médicos, clínicas y hospitales que lo han atendido. Solicitaremos sus registros a cada uno.",
        addProvider: "Agregar proveedor",
        removeProvider: "Eliminar",
        providerName: "Nombre del proveedor o clínica",
        providerSpecialty: "Especialidad",
        providerPhone: "Número de teléfono",
        providerCity: "Ciudad",
        providerLastVisit: "Fecha aproximada de su última visita",
        noProvidersYet: "Aún no ha agregado ningún proveedor.",
        providerHelp:
          "Agregue al menos un proveedor si ha recibido atención médica.",
      },
      step4: {
        title: "Historial Laboral",
        description:
          "Cuéntenos sobre sus últimos 5 trabajos. La Administración del Seguro Social usa esta información para determinar qué trabajo aún puede realizar.",
        addJob: "Agregar trabajo",
        removeJob: "Eliminar",
        employer: "Empleador",
        jobTitle: "Puesto",
        startDate: "Fecha de inicio",
        endDate: "Fecha de finalización",
        currentJob: "Todavía trabajo aquí",
        duties: "Tareas principales",
        dutiesPlaceholder:
          "Describa brevemente lo que hacía en un día típico",
        noJobsYet: "Aún no ha agregado ningún trabajo.",
      },
      step5: {
        title: "Revisar y Enviar",
        description:
          "Por favor revise su información abajo. Puede regresar a cualquier paso para hacer cambios.",
        personalInfo: "Información Personal",
        disability: "Información sobre la Incapacidad",
        providers: "Proveedores Médicos",
        workHistory: "Historial Laboral",
        noneProvided: "No proporcionado",
        consentTitle: "Consentimiento y Reconocimiento",
        consentText:
          "Al enviar este formulario, autorizo a Hogan Smith a comunicarse conmigo sobre mi reclamo por incapacidad y a comenzar a reunir la información necesaria para representarme. Entiendo que enviar este formulario no crea una relación abogado-cliente hasta que se firme un contrato de representación.",
        consentCheckbox: "He leído y acepto la declaración anterior",
        submitButton: "Enviar mi Solicitud",
      },
      success: {
        title: "Gracias — recibimos su información",
        message:
          "Un miembro de nuestro equipo de admisión revisará su solicitud y se comunicará con usted dentro de un día hábil. Si su situación es urgente, por favor llame a nuestra oficina directamente.",
        referenceNumber: "Número de referencia",
        returnHome: "Regresar al sitio principal",
      },
    },
    leads: {
      newLead: "Nuevo Prospecto",
      language: "Idioma",
    },
  },
};

/**
 * Count total string leaves in a translation tree (for diagnostics / tests).
 */
export function countKeys(tree: TranslationTree): number {
  let n = 0;
  for (const value of Object.values(tree)) {
    if (typeof value === "string") n += 1;
    else n += countKeys(value);
  }
  return n;
}

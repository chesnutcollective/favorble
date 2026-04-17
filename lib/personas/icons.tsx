/**
 * Persona icon resolver.
 *
 * Maps `PersonaConfig.icon` strings to concrete lucide-react components.
 * Next.js automatically optimizes lucide-react imports via its built-in
 * `optimizePackageImports` list, so the barrel import here is tree-shaken
 * down to only the icons actually referenced.
 */

import {
  Briefcase,
  CheckCircle,
  ClipboardList,
  DollarSign,
  Eye,
  EyeOff,
  FileCheck,
  FileText,
  Gavel,
  type LucideIcon,
  Mail,
  PhoneIncoming,
  Scale,
  ShieldCheck,
  Stethoscope,
  Users,
} from "lucide-react";

const ICON_REGISTRY: Record<string, LucideIcon> = {
  ShieldCheck,
  Scale,
  ClipboardList,
  FileCheck,
  PhoneIncoming,
  Mail,
  Stethoscope,
  FileText,
  Eye,
  DollarSign,
  Gavel,
  CheckCircle,
  Briefcase,
  EyeOff,
  Users,
};

/**
 * Resolve a persona's icon component by name. Returns the `Users` icon as a
 * visually-neutral fallback if the name isn't in the registry — callers
 * should not rely on that fallback (the string should match one we import).
 */
export function getPersonaIcon(name: string): LucideIcon {
  return ICON_REGISTRY[name] ?? Users;
}

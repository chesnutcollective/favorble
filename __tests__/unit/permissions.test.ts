import { describe, it, expect } from "vitest";
import {
  hasMinimumRole,
  canManageUsers,
  canConfigureSystem,
  canViewAllTeams,
  canChangeCaseStage,
  canAccessAdmin,
  canViewField,
  canEditField,
  getDefaultTeam,
} from "@/lib/permissions";

describe("permissions", () => {
  describe("hasMinimumRole", () => {
    it("admin has any minimum role", () => {
      expect(hasMinimumRole("admin", "admin")).toBe(true);
      expect(hasMinimumRole("admin", "viewer")).toBe(true);
    });

    it("viewer has minimum viewer", () => {
      expect(hasMinimumRole("viewer", "viewer")).toBe(true);
    });

    it("viewer does not have minimum admin", () => {
      expect(hasMinimumRole("viewer", "admin")).toBe(false);
    });

    it("filing_agent has minimum filing_agent", () => {
      expect(hasMinimumRole("filing_agent", "filing_agent")).toBe(true);
    });

    it("filing_agent does not have minimum case_manager", () => {
      expect(hasMinimumRole("filing_agent", "case_manager")).toBe(false);
    });
  });

  describe("role-based checks", () => {
    it("only admin can manage users", () => {
      expect(canManageUsers("admin")).toBe(true);
      expect(canManageUsers("attorney")).toBe(false);
      expect(canManageUsers("viewer")).toBe(false);
    });

    it("admin and attorney can configure system", () => {
      expect(canConfigureSystem("admin")).toBe(true);
      expect(canConfigureSystem("attorney")).toBe(true);
      expect(canConfigureSystem("case_manager")).toBe(false);
    });

    it("admin, attorney, case_manager can view all teams", () => {
      expect(canViewAllTeams("admin")).toBe(true);
      expect(canViewAllTeams("attorney")).toBe(true);
      expect(canViewAllTeams("case_manager")).toBe(true);
      expect(canViewAllTeams("filing_agent")).toBe(false);
    });

    it("most roles can change case stage", () => {
      expect(canChangeCaseStage("admin")).toBe(true);
      expect(canChangeCaseStage("filing_agent")).toBe(true);
      expect(canChangeCaseStage("viewer")).toBe(false);
    });

    it("admin and attorney can access admin panel", () => {
      expect(canAccessAdmin("admin")).toBe(true);
      expect(canAccessAdmin("attorney")).toBe(true);
      expect(canAccessAdmin("case_manager")).toBe(false);
    });
  });

  describe("field permissions", () => {
    it("all roles can view fields with no restrictions", () => {
      expect(canViewField("viewer", null)).toBe(true);
      expect(canViewField("viewer", [])).toBe(true);
    });

    it("admin can always view restricted fields", () => {
      expect(canViewField("admin", ["attorney"])).toBe(true);
    });

    it("role must be in list to view", () => {
      expect(canViewField("filing_agent", ["filing_agent", "admin"])).toBe(
        true,
      );
      expect(canViewField("viewer", ["filing_agent"])).toBe(false);
    });

    it("field editing follows same pattern", () => {
      expect(canEditField("admin", ["attorney"])).toBe(true);
      expect(canEditField("viewer", null)).toBe(true);
      expect(canEditField("viewer", ["admin"])).toBe(false);
    });
  });

  describe("getDefaultTeam", () => {
    it("maps roles to teams", () => {
      expect(getDefaultTeam("intake_agent")).toBe("intake");
      expect(getDefaultTeam("filing_agent")).toBe("filing");
      expect(getDefaultTeam("medical_records")).toBe("medical_records");
      expect(getDefaultTeam("mail_clerk")).toBe("mail_sorting");
      expect(getDefaultTeam("case_manager")).toBe("case_management");
    });

    it("returns null for roles without default team", () => {
      expect(getDefaultTeam("admin")).toBeNull();
      expect(getDefaultTeam("attorney")).toBeNull();
      expect(getDefaultTeam("viewer")).toBeNull();
    });
  });
});

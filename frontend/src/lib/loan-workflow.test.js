import { describe, expect, test } from "vitest"

import {
  canCommitteeDecide,
  canCreateLoan,
  canDisburse,
  canManageAdministrators,
  canRecommend,
  canRecordExpense,
  canRecordPayment,
  canRecordTransaction,
  canRespondAsGuarantor,
  LOAN_STATUSES,
  LOAN_STATUS_LABELS,
  LOAN_STATUS_VARIANTS,
  ROLES,
  transactionTypesForRole,
} from "./loan-workflow"

const ALL_ROLES = [
  "chairperson",
  "vice_chairperson",
  "loan_committee",
  "cashier",
  "accountant",
  "general_manager",
  "control_audit_committee",
]

describe("loan status data", () => {
  test("covers exactly the backend's nine statuses, each with a label and a variant", () => {
    expect(LOAN_STATUSES).toHaveLength(9)
    for (const status of LOAN_STATUSES) {
      expect(LOAN_STATUS_LABELS[status.value]).toBeTruthy()
      expect(LOAN_STATUS_VARIANTS[status.value]).toBeTruthy()
    }
  })

  test("marks the dead-end statuses as terminal", () => {
    const terminal = LOAN_STATUSES.filter((s) => s.terminal).map((s) => s.value)
    expect(terminal.sort()).toEqual(["closed", "guarantor_declined", "recommendation_declined", "rejected"].sort())
  })
})

describe("role visibility — mirrors the backend's role gates exactly", () => {
  test("only cashier and general_manager can create a loan application (INTAKE_LEVEL)", () => {
    for (const role of ALL_ROLES) {
      expect(canCreateLoan(role)).toBe(["cashier", "general_manager"].includes(role))
    }
  })

  test("only chairperson/vice_chairperson can recommend or decline a recommendation", () => {
    for (const role of ALL_ROLES) {
      expect(canRecommend(role)).toBe(["chairperson", "vice_chairperson"].includes(role))
    }
  })

  test("only loan_committee can approve or reject at committee stage", () => {
    for (const role of ALL_ROLES) {
      expect(canCommitteeDecide(role)).toBe(role === "loan_committee")
    }
  })

  test("only cashier can disburse a loan or record a payment", () => {
    for (const role of ALL_ROLES) {
      expect(canDisburse(role)).toBe(role === "cashier")
      expect(canRecordPayment(role)).toBe(role === "cashier")
    }
  })

  test("any authenticated role can record an office guarantor response", () => {
    for (const role of [...ALL_ROLES, null, undefined]) {
      expect(canRespondAsGuarantor(role)).toBe(true)
    }
  })

  test("only chair-level and general_manager can manage administrators", () => {
    for (const role of ALL_ROLES) {
      expect(canManageAdministrators(role)).toBe(["chairperson", "vice_chairperson", "general_manager"].includes(role))
    }
  })

  test("only accountant can record an expense", () => {
    for (const role of ALL_ROLES) {
      expect(canRecordExpense(role)).toBe(role === "accountant")
    }
  })

  test("an unrecognized or missing role gets no permissions", () => {
    for (const role of [undefined, null, "", "not-a-real-role"]) {
      expect(canCreateLoan(role)).toBe(false)
      expect(canRecommend(role)).toBe(false)
      expect(canCommitteeDecide(role)).toBe(false)
      expect(canDisburse(role)).toBe(false)
      expect(canManageAdministrators(role)).toBe(false)
      expect(canRecordExpense(role)).toBe(false)
      expect(canRecordTransaction(role)).toBe(false)
    }
  })
})

describe("generic transaction types by role", () => {
  test("cashier gets the non-loan ledger types, never a loan repayment type", () => {
    const types = transactionTypesForRole("cashier")
    expect(types).toContain("savings_deposit")
    for (const forbidden of ["loan_installment", "loan_interest", "loan_insurance", "penalty_payment"]) {
      expect(types).not.toContain(forbidden)
    }
  })

  test("accountant gets only bank_interest_income", () => {
    expect(transactionTypesForRole("accountant")).toEqual(["bank_interest_income"])
  })

  test("a role with no ledger permissions gets an empty list", () => {
    expect(transactionTypesForRole("loan_committee")).toEqual([])
    expect(canRecordTransaction("loan_committee")).toBe(false)
  })
})

test("ROLES lists exactly the seven backend administrator roles", () => {
  expect(ROLES.slice().sort()).toEqual(ALL_ROLES.slice().sort())
})

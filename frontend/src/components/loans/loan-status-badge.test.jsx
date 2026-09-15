import { render, screen } from "@testing-library/react"
import { describe, expect, test } from "vitest"

import { LoanStatusBadge } from "./loan-status-badge"
import { LOAN_STATUSES } from "@/lib/loan-workflow"

describe("LoanStatusBadge", () => {
  test.each(LOAN_STATUSES)("renders the human label for $value", ({ value, label }) => {
    render(<LoanStatusBadge status={value} />)
    expect(screen.getByText(label)).toBeInTheDocument()
  })

  test("falls back to the raw status string for an unrecognized value", () => {
    render(<LoanStatusBadge status="totally_made_up" />)
    expect(screen.getByText("totally_made_up")).toBeInTheDocument()
  })
})

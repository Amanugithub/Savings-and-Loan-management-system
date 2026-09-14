import { render, screen } from "@testing-library/react"
import { describe, expect, test } from "vitest"

import { WarningsAlert } from "./warnings-alert"

describe("WarningsAlert", () => {
  test("renders nothing when there are no warnings", () => {
    const { container } = render(<WarningsAlert warnings={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  test("renders nothing when warnings is undefined", () => {
    const { container } = render(<WarningsAlert />)
    expect(container).toBeEmptyDOMElement()
  })

  test("renders every warning's message", () => {
    render(
      <WarningsAlert
        warnings={[
          { code: "LOAN_AMOUNT_ABOVE_GUIDELINE", message: "Loan amount exceeds the normal 50,000 ETB guideline." },
          { code: "MONTHLY_SAVINGS_BELOW_GUIDELINE", message: "Monthly savings deposit is below the normal 300 ETB guideline." },
        ]}
      />
    )
    expect(screen.getByText(/exceeds the normal 50,000/)).toBeInTheDocument()
    expect(screen.getByText(/below the normal 300/)).toBeInTheDocument()
  })

  test("is announced as a status region, not an error", () => {
    render(<WarningsAlert warnings={[{ code: "X", message: "A guideline warning." }]} />)
    expect(screen.getByRole("status")).toBeInTheDocument()
  })
})

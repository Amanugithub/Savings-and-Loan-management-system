import { render, screen } from "@testing-library/react"
import { describe, expect, test } from "vitest"

import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "./select"

describe("Select", () => {
  test("renders the selected item label instead of the placeholder", () => {
    render(
      <Select defaultValue="cashier">
        <SelectTrigger aria-label="Role">
          <SelectValue placeholder="Select a role" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="cashier">Cashier</SelectItem>
            <SelectItem value="accountant">Accountant</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    )

    expect(screen.getByRole("combobox", { name: "Role" })).toHaveTextContent("Cashier")
    expect(screen.getByRole("combobox", { name: "Role" })).not.toHaveTextContent("Select a role")
  })
})

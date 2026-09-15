import { render, screen } from "@testing-library/react"
import { describe, expect, test } from "vitest"

import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "./select"

describe("Select", () => {
  test("shows the selected option label when items are rendered as children", () => {
    const { rerender } = render(
      <Select
        items={[{ value: "male", label: "Male" }, { value: "female", label: "Female" }]}
        value="female"
        onValueChange={() => {}}
      >
        <SelectTrigger aria-label="Gender"><SelectValue placeholder="Select a gender" /></SelectTrigger>
        <SelectContent><SelectGroup><SelectItem value="male">Male</SelectItem><SelectItem value="female">Female</SelectItem></SelectGroup></SelectContent>
      </Select>
    )

    expect(screen.getByRole("combobox")).toHaveTextContent("Female")
    expect(screen.getByRole("combobox")).not.toHaveTextContent("Select a gender")

    rerender(
      <Select
        items={[{ value: "male", label: "Male" }, { value: "female", label: "Female" }]}
        value="male"
        onValueChange={() => {}}
      >
        <SelectTrigger aria-label="Gender"><SelectValue placeholder="Select a gender" /></SelectTrigger>
        <SelectContent><SelectGroup><SelectItem value="male">Male</SelectItem><SelectItem value="female">Female</SelectItem></SelectGroup></SelectContent>
      </Select>
    )

    expect(screen.getByRole("combobox")).toHaveTextContent("Male")
  })
})

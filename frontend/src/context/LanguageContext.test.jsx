import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { useState } from "react"
import { describe, expect, test } from "vitest"

import { LanguageProvider } from "./LanguageContext"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

function SelectHarness() {
  const [value, setValue] = useState("male")

  return (
    <>
      <button type="button" onClick={() => setValue("female")}>Choose female</button>
      <Select
        items={[{ value: "male", label: "Male" }, { value: "female", label: "Female" }]}
        value={value}
        onValueChange={setValue}
      >
        <SelectTrigger aria-label="Gender">
          <SelectValue placeholder="Select a gender" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="male">Male</SelectItem>
            <SelectItem value="female">Female</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    </>
  )
}

describe("LanguageProvider", () => {
  test("does not overwrite a select value after React updates it", async () => {
    render(
      <LanguageProvider>
        <SelectHarness />
      </LanguageProvider>
    )

    expect(screen.getByRole("combobox")).toHaveTextContent("Male")

    const valueText = screen.getByRole("combobox").querySelector('[data-slot="select-value"]').firstChild
    valueText.nodeValue = "Female"
    const observerMarker = document.createElement("span")
    document.body.appendChild(observerMarker)
    await waitFor(() => expect(screen.getByRole("combobox")).toHaveTextContent("Female"))
    observerMarker.remove()

    fireEvent.click(screen.getByRole("button", { name: "Choose female" }))

    await waitFor(() => expect(screen.getByRole("combobox")).toHaveTextContent("Female"))
  })
})

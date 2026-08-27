/* eslint-disable react-refresh/only-export-components */

import { createContext, useContext, useEffect, useState } from "react"

const ThemeContext = createContext(null)

function getInitialTheme() {
  const savedTheme = window.localStorage.getItem("sacco-theme")
  if (savedTheme === "light" || savedTheme === "dark") return savedTheme
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getInitialTheme)

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark")
    document.documentElement.style.colorScheme = theme
    window.localStorage.setItem("sacco-theme", theme)
  }, [theme])

  const toggleTheme = () => setTheme((current) => current === "dark" ? "light" : "dark")

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error("useTheme must be used within a ThemeProvider")
  return context
}

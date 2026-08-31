/* eslint-disable react-refresh/only-export-components */

import { createContext, useContext, useEffect, useState } from "react"

import { translatedText } from "@/lib/language"

const LanguageContext = createContext(null)
const originalTextByNode = new WeakMap()

function getInitialLanguage() {
  const saved = window.localStorage.getItem("sacco-language")
  return saved === "am" || saved === "en" ? saved : "en"
}

function translateDocument(language) {
  document.documentElement.lang = language === "am" ? "am" : "en"
  document.documentElement.classList.toggle("amharic-ui", language === "am")

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  let node
  while ((node = walker.nextNode())) {
    if (node.parentElement?.closest("script, style, [data-no-translate]")) continue
    const original = originalTextByNode.get(node) || node.textContent
    originalTextByNode.set(node, original)
    const translated = translatedText(original, language)
    if (node.textContent !== translated) node.textContent = translated
  }

  document.querySelectorAll("[placeholder], [aria-label], [title]").forEach((element) => {
    if (element.closest("[data-no-translate]")) return
    for (const attribute of ["placeholder", "aria-label", "title"]) {
      if (!element.hasAttribute(attribute)) continue
      const key = `original${attribute.replace("-", "_")}`
      const original = element.dataset[key] || element.getAttribute(attribute)
      element.dataset[key] = original
      element.setAttribute(attribute, translatedText(original, language))
    }
  })
}

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(getInitialLanguage)

  useEffect(() => {
    window.localStorage.setItem("sacco-language", language)
    translateDocument(language)

    const observer = new MutationObserver(() => translateDocument(language))
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [language])

  return <LanguageContext.Provider value={{ language, setLanguage }}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (!context) throw new Error("useLanguage must be used within a LanguageProvider")
  return context
}

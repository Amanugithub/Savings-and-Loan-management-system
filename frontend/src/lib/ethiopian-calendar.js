const ETHIOPIAN_MONTHS = [
  "መስከረም", "ጥቅምት", "ኅዳር", "ታኅሣሥ", "ጥር", "የካቲት",
  "መጋቢት", "ሚያዝያ", "ግንቦት", "ሰኔ", "ሐምሌ", "ነሐሴ", "ጳጉሜን",
]

function assertEthiopianDate(year, month, day) {
  const maxDay = month === 13 ? (isEthiopianLeapYear(year) ? 6 : 5) : 30
  if (!Number.isInteger(year) || year < 1 || !Number.isInteger(month) || month < 1 || month > 13 || !Number.isInteger(day) || day < 1 || day > maxDay) {
    throw new Error("Invalid Ethiopian calendar date")
  }
}

export function isEthiopianLeapYear(year) {
  return (year + 1) % 4 === 0
}

function utcDate(year, month, day) {
  const date = new Date(0)
  date.setUTCHours(0, 0, 0, 0)
  date.setUTCFullYear(year, month - 1, day)
  return date
}

function isoDate(date) {
  return `${date.getUTCFullYear().toString().padStart(4, "0")}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`
}

function parseIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null
  const [year, month, day] = value.slice(0, 10).split("-").map(Number)
  const date = utcDate(year, month, day)
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day ? date : null
}

function ethiopianNewYear(year) {
  const gregorianYear = year + 7
  const day = (gregorianYear + 1) % 4 === 0 ? 12 : 11
  return utcDate(gregorianYear, 9, day)
}

export function ethiopianToGregorianIso(year, month, day) {
  assertEthiopianDate(year, month, day)
  const result = ethiopianNewYear(year)
  result.setUTCDate(result.getUTCDate() + (month - 1) * 30 + day - 1)
  return isoDate(result)
}

export function gregorianToEthiopian(value) {
  const date = typeof value === "string" ? parseIsoDate(value) : value
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) throw new Error("Invalid Gregorian date")
  const utc = utcDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())
  const candidateYear = utc.getUTCFullYear() - 7
  const start = ethiopianNewYear(candidateYear)
  const year = utc >= start ? candidateYear : candidateYear - 1
  const yearStart = ethiopianNewYear(year)
  const days = Math.floor((utc - yearStart) / 86400000)
  return { year, month: Math.floor(days / 30) + 1, day: (days % 30) + 1 }
}

export function formatEthiopianDate(value, options = {}) {
  const date = typeof value === "string" ? parseIsoDate(value) : value
  if (!date) return "—"
  return new Intl.DateTimeFormat(options.locale || "am-ET-u-ca-ethiopic", {
    day: "numeric", month: "long", year: "numeric", timeZone: "UTC", ...options,
  }).format(date)
}

export function formatEthiopianDateTime(value, options = {}) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return new Intl.DateTimeFormat(options.locale || "am-ET-u-ca-ethiopic", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Addis_Ababa", ...options,
  }).format(date)
}

export function todayGregorianIso() {
  const now = new Date()
  return isoDate(utcDate(now.getFullYear(), now.getMonth() + 1, now.getDate()))
}

export function compareEthiopianDates(left, right) {
  return ethiopianToGregorianIso(left.year, left.month, left.day).localeCompare(ethiopianToGregorianIso(right.year, right.month, right.day))
}

export { ETHIOPIAN_MONTHS }

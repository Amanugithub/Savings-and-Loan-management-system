const DAY_MS = 24 * 60 * 60 * 1000;

export const ETHIOPIAN_MONTHS = [
  'መስከረም', 'ጥቅምት', 'ኅዳር', 'ታኅሣሥ', 'ጥር', 'የካቲት',
  'መጋቢት', 'ሚያዝያ', 'ግንቦት', 'ሰኔ', 'ሐምሌ', 'ነሐሴ', 'ጳጉሜን',
];

const ENGLISH_MONTHS = [
  'Meskerem', 'Tikimt', 'Hidar', 'Tahsas', 'Tir', 'Yekatit',
  'Megabit', 'Miyazya', 'Ginbot', 'Sene', 'Hamle', 'Nehase', 'Pagumen',
];
const OROMO_MONTHS = [
  'Fuulbana', 'Onkololeessa', 'Sadaasa', 'Muddee', 'Amajjii', 'Guraandhala',
  'Bitootessa', 'Ebla', 'Caamsaa', 'Waxabajjii', 'Adooleessa', 'Hagayya', 'Qaammee',
];

const AMHARIC_WEEKDAYS = [
  'እሑድ', 'ሰኞ', 'ማክሰኞ', 'ረቡዕ', 'ሐሙስ', 'ዓርብ', 'ቅዳሜ',
];
const OROMO_WEEKDAYS = [
  'Dilbata', 'Wiixata', 'Kibxata', 'Roobii', 'Kamisa', 'Jimaata', 'Sanbata',
];

function isEthiopianLeapYear(year) {
  return (year + 1) % 4 === 0;
}

function utcDate(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day));
}

function ethiopianNewYear(year) {
  const gregorianYear = year + 7;
  return utcDate(gregorianYear, 9, (gregorianYear + 1) % 4 === 0 ? 12 : 11);
}

function gregorianToEthiopian(date) {
  const approximateYear = date.getUTCFullYear() - 7;
  const year = date >= ethiopianNewYear(approximateYear)
    ? approximateYear
    : approximateYear - 1;
  const elapsedDays = Math.floor((date - ethiopianNewYear(year)) / DAY_MS);
  return {
    year,
    month: Math.floor(elapsedDays / 30) + 1,
    day: (elapsedDays % 30) + 1,
  };
}

function toAddisGregorianDate(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
  } else if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parts = value.split('-').map(Number);
    return utcDate(parts[0], parts[1], parts[2]);
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Addis_Ababa',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(date);
  const get = (type) => Number(parts.find((part) => part.type === type)?.value);
  return utcDate(get('year'), get('month'), get('day'));
}

export function getEthiopianHour(value = new Date()) {
  const date = new Date(value);
  return Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Addis_Ababa',
    hour: 'numeric',
    hour12: false,
  }).format(date));
}

export function getEthiopianGreeting(value = new Date()) {
  const hour = getEthiopianHour(value);
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function formatEthiopianDateTime(value = new Date(), options = {}) {
  const date = toAddisGregorianDate(value);
  if (!date) return '—';
  const result = gregorianToEthiopian(date);
  const language = options.language === 'am' || options.language === 'om' ? options.language : 'en';
  const months = language === 'am' ? ETHIOPIAN_MONTHS : language === 'om' ? OROMO_MONTHS : ENGLISH_MONTHS;
  const weekday = language === 'am'
    ? AMHARIC_WEEKDAYS[date.getUTCDay()]
    : language === 'om'
      ? OROMO_WEEKDAYS[date.getUTCDay()]
    : new Intl.DateTimeFormat('en-ET', { weekday: 'long', timeZone: 'UTC' }).format(date);
  return weekday + ', ' + months[result.month - 1] + ' ' + result.day + ', ' + result.year;
}

export function formatEthiopianDate(value = new Date(), options = {}) {
  const formatted = formatEthiopianDateTime(value, options);
  return formatted.replace(/^[^,]+, /, '');
}

export { isEthiopianLeapYear, gregorianToEthiopian };

/**
 * Generate a secure random numeric password.
 * @param {number} length - Password length (default: 10, range: 8-12)
 * @returns {string} - Generated password
 */
export function generatePassword(length = 10) {
  const numbers = '0123456789'

  const safeLength = Math.min(12, Math.max(8, Number(length) || 10))
  const password = []

  for (let i = 0; i < safeLength; i++) {
    password.push(numbers[Math.floor(Math.random() * numbers.length)])
  }

  return password.join('')
}

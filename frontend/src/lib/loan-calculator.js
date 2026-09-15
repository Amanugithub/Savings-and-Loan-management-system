/**
 * Interest rates by term (from backend)
 */
const INTEREST_RATE_BY_TERM = {
  1: 8,
  2: 8,
  3: 10,
  4: 11,
  5: 13,
}

/**
 * Calculate loan details
 * @param {number} principalAmount - The principal loan amount
 * @param {number} termYears - Loan term in years
 * @returns {object} - Calculated loan details
 */
export function calculateLoanDetails(principalAmount, termYears) {
  if (!principalAmount || !termYears || principalAmount <= 0) {
    return null
  }

  const principal = Number(principalAmount)
  const months = termYears * 12
  const interestRate = INTEREST_RATE_BY_TERM[termYears] || 0

  // Monthly principal installment
  const monthlyPrincipal = Math.round((principal / months + Number.EPSILON) * 100) / 100

  // Monthly interest amount
  const monthlyInterest = Math.round((principal * interestRate / 100 / months + Number.EPSILON) * 100) / 100

  // Total interest over loan term
  const totalInterest = Math.round((monthlyInterest * months + Number.EPSILON) * 100) / 100

  // Insurance amount (1% of principal, total for the loan)
  const insuranceAmount = Math.round((principal * 0.01 + Number.EPSILON) * 100) / 100

  // Monthly insurance installment
  const monthlyInsurance = Math.round((insuranceAmount / months + Number.EPSILON) * 100) / 100

  // Total monthly payment
  const monthlyPayment = Math.round((monthlyPrincipal + monthlyInterest + monthlyInsurance + Number.EPSILON) * 100) / 100

  // Total amount to be repaid
  const totalRepayment = Math.round((principal + totalInterest + insuranceAmount + Number.EPSILON) * 100) / 100

  return {
    principal,
    termYears,
    months,
    interestRate,
    monthlyPrincipal,
    monthlyInterest,
    totalInterest,
    insuranceAmount,
    monthlyInsurance,
    monthlyPayment,
    totalRepayment,
  }
}

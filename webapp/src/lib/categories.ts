// The app's default categories and its Plaid mapping (davey-ios Domain/PlaidCategoryMapper.swift), so the web shows
// the same category names the app assigns on import.

const BY_DETAILED: Record<string, string> = {
  INCOME_WAGES: 'Paycheck',
  LOAN_PAYMENTS_CREDIT_CARD_PAYMENT: 'Credit Card Payment',
  LOAN_PAYMENTS_MORTGAGE_PAYMENT: 'Rent & Mortgage',
  RENT_AND_UTILITIES_RENT: 'Rent & Mortgage',
  RENT_AND_UTILITIES_GAS_AND_ELECTRICITY: 'Utilities',
  RENT_AND_UTILITIES_WATER: 'Utilities',
  RENT_AND_UTILITIES_SEWAGE_AND_WASTE_MANAGEMENT: 'Utilities',
  RENT_AND_UTILITIES_OTHER_UTILITIES: 'Utilities',
  RENT_AND_UTILITIES_TELEPHONE: 'Internet & Phone',
  RENT_AND_UTILITIES_INTERNET_AND_CABLE: 'Internet & Phone',
  FOOD_AND_DRINK_GROCERIES: 'Groceries',
  TRANSPORTATION_GAS: 'Gas',
  TRANSPORTATION_PUBLIC_TRANSIT: 'Transit & Parking',
  TRANSPORTATION_PARKING: 'Transit & Parking',
  TRANSPORTATION_TOLLS: 'Transit & Parking',
  TRANSPORTATION_TAXIS_AND_RIDE_SHARES: 'Transit & Parking',
  PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS: 'Fitness',
  GOVERNMENT_AND_NON_PROFIT_DONATIONS: 'Gifts & Donations',
  GENERAL_MERCHANDISE_GIFTS_AND_NOVELTIES: 'Gifts & Donations',
}

const BY_PRIMARY: Record<string, string> = {
  INCOME: 'Other Income',
  TRANSFER_IN: 'Transfer',
  TRANSFER_OUT: 'Transfer',
  FOOD_AND_DRINK: 'Dining Out',
  GENERAL_MERCHANDISE: 'Shopping',
  ENTERTAINMENT: 'Entertainment',
  MEDICAL: 'Medical',
  PERSONAL_CARE: 'Personal Care',
}

export function plaidCategory(primary?: string | null, detailed?: string | null): string | undefined {
  return (detailed && BY_DETAILED[detailed]) || (primary && BY_PRIMARY[primary]) || undefined
}

/** The app's default category list (DefaultCategories.swift), in its order. */
export const APP_CATEGORIES = [
  'Paycheck', 'Other Income', 'Rent & Mortgage', 'Utilities', 'Internet & Phone', 'Groceries', 'Dining Out', 'Gas',
  'Transit & Parking', 'Shopping', 'Entertainment', 'Subscriptions', 'Medical', 'Fitness', 'Personal Care',
  'Gifts & Donations', 'Miscellaneous', 'Transfer', 'Credit Card Payment', 'Debt Payment', 'Loan Interest',
  'Property Taxes & Insurance',
]

/** Categories the app treats as transfers (never income or spending). */
export const TRANSFER_CATEGORIES = new Set(['Transfer', 'Credit Card Payment', 'Debt Payment'])

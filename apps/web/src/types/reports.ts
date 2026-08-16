/** reports-svc `/api/reports` payloads (CONTRACT §6). */

export interface MortgageCalculationPayload {
  price: number;
  downPaymentPercent: number;
  years: number;
  annualRatePercent: number;
}

export interface MortgageCalculation {
  price: number;
  downPayment: number;
  loanAmount: number;
  monthlyPayment: number;
  totalPayment: number;
  totalInterest: number;
  annualRatePercent: number;
  years: number;
}

export interface InstallmentSchedulePayload {
  price: number;
  downPaymentPercent: number;
  years: number;
  deliveryDate?: string;
}

export interface InstallmentScheduleRow {
  index: number;
  dueDate: string;
  amount: number;
  remainingBalance: number;
  label?: string;
}

export interface InstallmentSchedule {
  price: number;
  downPayment: number;
  monthlyInstallment: number;
  totalInstallments: number;
  deliveryDate?: string;
  rows: InstallmentScheduleRow[];
}

export interface MarketSummaryPoint {
  period: string;
  avgPricePerMeter: number;
  listings: number;
  medianPrice?: number;
}

export interface MarketSummary {
  areaId?: string;
  areaName?: string;
  from: string;
  to: string;
  avgPricePerMeter: number;
  changePercent: number;
  totalListings: number;
  series: MarketSummaryPoint[];
}

export type CurrencyCode = 'INR' | 'USD' | 'EUR' | 'GBP' | 'AED';

export interface Money {
  /** Integer minor units (for example, paise for INR). Never a floating-point major unit. */
  readonly amountMinor: number;
  readonly currency: CurrencyCode;
}

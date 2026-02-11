export interface Transaction {
  date: string;
  category: string;
  description: string;
  amount: number;
  needsReview?: boolean;
}

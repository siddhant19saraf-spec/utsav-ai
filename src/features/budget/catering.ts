import type { BudgetCategory } from '@/types/budget';

export function findCateringCategory(
  categories: readonly BudgetCategory[],
): BudgetCategory | null {
  const exact = categories.find(
    (category) => category.name.trim().toLowerCase() === 'catering',
  );

  return (
    exact ??
    categories.find(
      (category) =>
        category.id.toLowerCase().includes('catering') ||
        category.name.toLowerCase().includes('catering'),
    ) ??
    null
  );
}

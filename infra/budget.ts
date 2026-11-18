import type { PortfolioConfig } from './config';

/**
 * Monthly cost budget with email alerts at 50 % and 80 % of the limit.
 *
 * A budget is account-wide (it watches the whole bill), so only the production
 * stage creates it, and only when PORTFOLIO_BUDGET_EMAIL is set.
 *
 * It only covers the AWS bill. Claude runs on the Anthropic API, whose hard
 * spend limit is prepaid credits with auto-reload off.
 */
export function createBudget(config: PortfolioConfig) {
  if (!config.budget) return undefined;
  const { email, limitUsd } = config.budget;

  const notification = (threshold: number) => ({
    comparisonOperator: 'GREATER_THAN',
    threshold,
    thresholdType: 'PERCENTAGE',
    notificationType: 'ACTUAL',
    subscriberEmailAddresses: [email],
  });

  return new aws.budgets.Budget('MonthlyBudget', {
    name: 'portfolio-monthly',
    budgetType: 'COST',
    limitAmount: String(limitUsd),
    // Budgets are denominated in USD for most accounts.
    limitUnit: 'USD',
    timeUnit: 'MONTHLY',
    notifications: [notification(50), notification(80)],
  });
}

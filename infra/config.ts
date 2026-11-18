/**
 * Deployment configuration, resolved from environment variables so nothing
 * account-specific (domain, email) is committed. Pure function: unit tested
 * in config.test.ts.
 *
 * Variables (all optional):
 *   PORTFOLIO_DOMAIN             custom domain for production, e.g. example.com.
 *                                Unset = CloudFront default domain.
 *   PORTFOLIO_DOMAIN_REDIRECTS   comma-separated extra hostnames that redirect
 *                                to the domain, e.g. www.example.com.
 *   PORTFOLIO_CERT_ARN           existing ACM certificate (must be in us-east-1).
 *                                Set it when DNS is NOT in Route 53; SST then
 *                                skips DNS and certificate creation.
 *   PORTFOLIO_BUDGET_EMAIL       recipient of the budget alerts. Unset = no budget.
 *   PORTFOLIO_BUDGET_LIMIT_USD   monthly limit for the account (default 20).
 */

export interface DomainConfig {
  name: string;
  redirects: string[];
  /** Present when the certificate/DNS are managed outside SST. */
  certArn?: string;
}

export interface BudgetConfig {
  email: string;
  limitUsd: number;
}

export interface PortfolioConfig {
  stage: string;
  isProduction: boolean;
  /** Only ever set on production: personal stages use the CloudFront domain. */
  domain?: DomainConfig;
  /** Only ever set on production: a budget is account-wide, one is enough. */
  budget?: BudgetConfig;
}

export const PRODUCTION_STAGE = 'production';
export const DEFAULT_BUDGET_LIMIT_USD = 20;

type Env = Record<string, string | undefined>;

const clean = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

const HOSTNAME =
  /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

function parseHostname(value: string, variable: string): string {
  const hostname = value.toLowerCase();
  if (!HOSTNAME.test(hostname)) {
    throw new Error(`${variable} is not a valid hostname: "${value}"`);
  }
  return hostname;
}

export function resolveConfig(env: Env, stage: string): PortfolioConfig {
  const isProduction = stage === PRODUCTION_STAGE;

  const domainName = clean(env.PORTFOLIO_DOMAIN);
  let domain: DomainConfig | undefined;
  if (isProduction && domainName) {
    const certArn = clean(env.PORTFOLIO_CERT_ARN);
    if (certArn && !certArn.startsWith('arn:aws:acm:us-east-1:')) {
      throw new Error(
        'PORTFOLIO_CERT_ARN must be an ACM certificate in us-east-1 (CloudFront requirement).',
      );
    }
    domain = {
      name: parseHostname(domainName, 'PORTFOLIO_DOMAIN'),
      redirects: (clean(env.PORTFOLIO_DOMAIN_REDIRECTS) ?? '')
        .split(',')
        .map((host) => host.trim())
        .filter(Boolean)
        .map((host) => parseHostname(host, 'PORTFOLIO_DOMAIN_REDIRECTS')),
      certArn,
    };
  }

  const email = clean(env.PORTFOLIO_BUDGET_EMAIL);
  let budget: BudgetConfig | undefined;
  if (isProduction && email) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('PORTFOLIO_BUDGET_EMAIL is not a valid email address.');
    }
    const rawLimit = clean(env.PORTFOLIO_BUDGET_LIMIT_USD);
    const limitUsd = rawLimit ? Number(rawLimit) : DEFAULT_BUDGET_LIMIT_USD;
    if (!Number.isFinite(limitUsd) || limitUsd <= 0) {
      throw new Error('PORTFOLIO_BUDGET_LIMIT_USD must be a positive number.');
    }
    budget = { email, limitUsd };
  }

  return { stage, isProduction, domain, budget };
}

# Infrastructure

Static site on S3 + CloudFront, deployed with [SST](https://sst.dev).

| File                         | Purpose                                                    |
| ---------------------------- | ---------------------------------------------------------- |
| `../sst.config.ts`           | App name, region, removal policy (retain on `production`)  |
| `config.ts`                  | Reads the optional environment variables below             |
| `site.ts`                    | `sst.aws.StaticSite`: private bucket, OAC, cache, domain   |
| `edge.ts`                    | Security headers added by a CloudFront Function            |
| `budget.ts`                  | Monthly AWS Budget with email alerts at 50 % and 80 %      |
| `bootstrap/github-oidc.yaml` | One-time CloudFormation stack: GitHub OIDC provider + role |

## Configuration (all optional)

Set as GitHub repository **variables** (or **secrets** where noted) for CI, or
exported in the shell for local deploys.

| Name                         | Effect                                                             |
| ---------------------------- | ------------------------------------------------------------------ |
| `PORTFOLIO_DOMAIN`           | Custom domain for `production`. Unset = CloudFront default domain. |
| `PORTFOLIO_DOMAIN_REDIRECTS` | Comma-separated extra hostnames that redirect to the domain.       |
| `PORTFOLIO_CERT_ARN`         | Existing us-east-1 ACM certificate, when DNS is not in Route 53.   |
| `PORTFOLIO_BUDGET_EMAIL`     | **Secret.** Budget alert recipient. Unset = no budget.             |
| `PORTFOLIO_BUDGET_LIMIT_USD` | Monthly limit, default 20.                                         |
| `PORTFOLIO_AWS_REGION`       | Defaults to `eu-west-1`.                                           |

## Stages

`production` is deployed by `.github/workflows/deploy.yml`. Personal stages are
deployed by hand (`pnpm exec sst deploy --stage <name>`), never get the domain
or the budget, and are removed with `pnpm exec sst remove --stage <name>`.

## Bootstrap

See the S02 spec (`docs/specs/02-infra-deploy.md`, local only) for the full
runbook. In short: deploy `bootstrap/github-oidc.yaml` once with local
credentials, then set the `AWS_ROLE_ARN` repository variable to its `RoleArn`
output.

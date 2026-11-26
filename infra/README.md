# Infrastructure

Static site on S3 + CloudFront, deployed with [SST](https://sst.dev).

| File               | Purpose                                                   |
| ------------------ | --------------------------------------------------------- |
| `../sst.config.ts` | App name, region, removal policy (retain on `production`) |
| `config.ts`        | Reads the optional environment variables below            |
| `site.ts`          | `sst.aws.StaticSite`: private bucket, OAC, cache, domain  |
| `edge.ts`          | Security headers added by a CloudFront Function           |
| `budget.ts`        | Monthly AWS Budget with email alerts at 50 % and 80 %     |
| `ai.ts`            | AI backend: streaming Lambda, DynamoDB table, secrets     |
| `ai-config.ts`     | Reads the `PORTFOLIO_AI_*` variables below                |

## Configuration (all optional)

Exported in the shell before running `sst deploy`.

| Name                           | Effect                                                             |
| ------------------------------ | ------------------------------------------------------------------ |
| `PORTFOLIO_DOMAIN`             | Custom domain for `production`. Unset = CloudFront default domain. |
| `PORTFOLIO_DOMAIN_REDIRECTS`   | Comma-separated extra hostnames that redirect to the domain.       |
| `PORTFOLIO_CERT_ARN`           | Existing us-east-1 ACM certificate, when DNS is not in Route 53.   |
| `PORTFOLIO_BUDGET_EMAIL`       | Budget alert recipient. Unset = no budget.                         |
| `PORTFOLIO_BUDGET_LIMIT_USD`   | Monthly limit, default 20.                                         |
| `PORTFOLIO_AWS_REGION`         | Defaults to `eu-north-1`.                                          |
| `PORTFOLIO_AI_ENABLED`         | `true` creates the AI backend (needs its three secrets set first). |
| `PORTFOLIO_AI_ALLOWED_ORIGINS` | Extra origins allowed to call it, e.g. the CloudFront URL.         |
| `PORTFOLIO_AI_DAILY_LIMIT_USD` | Daily spend brake for Claude calls, default 0.5.                   |
| `PORTFOLIO_AI_SCOPE_GATE`      | Scope gate (S17): `off` (default), `shadow` or `enforce`.          |

## Deploying

Deploys are manual, from a machine signed in to AWS. The AWS project this site
uses only allows its assigned Region (`eu-north-1`) and does not allow IAM
OIDC providers, so CI cannot assume a deploy role. GitHub Actions only runs
`check`, `test` and `build`.

```sh
aws login --profile <profile>   # browser sign-in; credentials last 12 hours
export AWS_PROFILE=<profile>-sst   # credential_process profile, see below
PORTFOLIO_BUDGET_EMAIL=you@example.com pnpm exec sst deploy --stage production
```

SST does not support the `login_session` credentials that `aws login` writes
yet, so point it at a second profile that turns them into short-lived
credentials on demand:

```ini
[profile <profile>-sst]
credential_process = aws configure export-credentials --profile <profile> --format process
region = eu-north-1
```

Always pass `PORTFOLIO_BUDGET_EMAIL` when deploying `production`: SST applies
exactly what the configuration declares, so a deploy without it removes the
budget.

## Stages

`production` is the live site (removal `retain`, protected). Personal stages
(`pnpm exec sst deploy --stage <name>`) never get the domain or the budget and
are removed with `pnpm exec sst remove --stage <name>`.

## AI backend

Off unless `PORTFOLIO_AI_ENABLED=true`. Before enabling it on a stage, set its
secrets (see the header of `ai.ts`):

```sh
pnpm exec sst secret set AnthropicApiKey <key> --stage production
pnpm exec sst secret set TurnstileSecret <secret> --stage production
pnpm exec sst secret set IpHashSalt "$(openssl rand -hex 32)" --stage production
```

With `PORTFOLIO_AI_SCOPE_GATE=shadow` or `enforce`, also set the Jev key:

```sh
pnpm exec sst secret set TypeSafeApiKey <key> --stage production
```

Each deploy rebuilds `.ai-context/context.json` from `src/content` and ships it
with the Lambda. The endpoint URL is the `aiUrl` output.

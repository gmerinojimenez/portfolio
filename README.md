# Portfolio

My professional portfolio, built as a console you can type into, and a lab for running Claude-powered features in production on AWS.

Work in progress.

## Stack

- [Astro](https://astro.build) static site, bilingual (`/es/`, `/en/`)
- AWS: S3 + CloudFront, Lambda, DynamoDB, provisioned with SST
- Claude via the Anthropic API, embeddings with Voyage AI

## Development

Requires Node 24 (see `.nvmrc`) and pnpm.

```bash
pnpm install
pnpm dev      # local dev server
pnpm check    # type check, lint and formatting
pnpm test     # unit tests
pnpm build    # static build into dist/
```

// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./.sst/platform/config.d.ts" />

/**
 * SST entry point. Runbook and design notes: infra/README.md.
 *
 * Reminder: sst.config.ts cannot have top-level imports; project code is
 * loaded with dynamic imports inside run().
 */
export default $config({
  app(input) {
    const isProduction = input.stage === 'production';
    return {
      name: 'portfolio',
      // Retain stateful resources (the site bucket) on production only.
      removal: isProduction ? 'retain' : 'remove',
      // `sst remove` refuses to run on production.
      protect: isProduction,
      home: 'aws',
      providers: {
        aws: {
          // Stockholm: the AWS project this site deploys to only allows its
          // assigned Region (us-east-1 is reserved for global services such
          // as the CloudFront certificate). Change it only before the first
          // deploy; on a deployed stage it moves the state.
          region: (process.env.PORTFOLIO_AWS_REGION ??
            'eu-north-1') as aws.Region,
        },
      },
    };
  },
  async run() {
    const { resolveConfig } = await import('./infra/config');
    const config = resolveConfig(process.env, $app.stage);

    const { createSite } = await import('./infra/site');
    const site = createSite(config);

    const { createBudget } = await import('./infra/budget');
    createBudget(config);

    return { url: site.url };
  },
});

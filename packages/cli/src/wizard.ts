import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as p from '@clack/prompts';
import {
  RELAY_HANDLERS_TEMPLATE,
  buildRelayConfigTemplate,
  databasePackages,
  pluginPackages,
  type DatabaseChoice,
  type PluginChoice,
} from './templates';
import { detectPackageManager, installPackages } from './package-manager';

type FrameworkChoice = 'nextjs' | 'express' | 'hono' | 'nestjs' | 'generic';

async function detectNextJs(dir: string): Promise<boolean> {
  try {
    const raw = await readFile(join(dir, 'package.json'), 'utf8');
    const pkg = JSON.parse(raw) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    return Boolean(pkg.dependencies?.['next'] ?? pkg.devDependencies?.['next']);
  } catch {
    return false;
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function runInitWizard(dir: string, force: boolean): Promise<void> {
  p.intro('relay init');

  const appName = await p.text({
    message: 'App name',
    placeholder: 'my-app',
    defaultValue: 'my-app',
  });
  if (p.isCancel(appName)) {
    p.cancel('Cancelled.');
    return;
  }

  const nextDetected = await detectNextJs(dir);
  let framework: FrameworkChoice;
  if (nextDetected) {
    p.log.info('Detected Next.js - wiring the App Router handler.');
    framework = 'nextjs';
  } else {
    const chosen = await p.select({
      message: 'Framework',
      options: [
        { value: 'nextjs' as const, label: 'Next.js' },
        { value: 'express' as const, label: 'Express' },
        { value: 'hono' as const, label: 'Hono' },
        { value: 'nestjs' as const, label: 'NestJS' },
        { value: 'generic' as const, label: 'Other / generic (wire the handler manually)' },
      ],
    });
    if (p.isCancel(chosen)) {
      p.cancel('Cancelled.');
      return;
    }
    framework = chosen;
  }

  const database = await p.select({
    message: 'Database',
    options: [
      { value: 'sqlite' as const, label: 'SQLite', hint: 'recommended to get started' },
      { value: 'postgres' as const, label: 'Postgres' },
      { value: 'mysql' as const, label: 'MySQL' },
    ],
  });
  if (p.isCancel(database)) {
    p.cancel('Cancelled.');
    return;
  }

  const plugins = await p.multiselect({
    message: 'Plugins to enable',
    options: [
      { value: 'stripe' as const, label: 'Stripe' },
      { value: 'github' as const, label: 'GitHub' },
      { value: 'clerk' as const, label: 'Clerk' },
      { value: 'shopify' as const, label: 'Shopify' },
      { value: 'resend' as const, label: 'Resend' },
    ],
    required: false,
  });
  if (p.isCancel(plugins)) {
    p.cancel('Cancelled.');
    return;
  }

  const configPath = join(dir, 'relay.ts');
  const handlersPath = join(dir, 'relay.handlers.ts');
  if (!force) {
    for (const path of [configPath, handlersPath]) {
      if (await pathExists(path)) {
        p.cancel(`${path} already exists. Use --force to overwrite.`);
        return;
      }
    }
  }

  await writeFile(handlersPath, RELAY_HANDLERS_TEMPLATE, 'utf8');
  p.log.step(`Created ${handlersPath}`);
  await writeFile(
    configPath,
    buildRelayConfigTemplate({
      database: database as DatabaseChoice,
      plugins: plugins as PluginChoice[],
    }),
    'utf8',
  );
  p.log.step(`Created ${configPath}`);

  if (framework === 'nextjs') {
    const routeDir = join(dir, 'app', 'api', 'webhook', '[...all]');
    await mkdir(routeDir, { recursive: true });
    const routePath = join(routeDir, 'route.ts');
    await writeFile(
      routePath,
      `import { toNextJsHandler } from 'relayos/next-js';\nimport { relay } from '../../../../relay';\n\nexport const { POST } = toNextJsHandler(relay);\n`,
      'utf8',
    );
    p.log.step(`Created ${routePath}`);
  } else if (framework === 'express') {
    const routePath = join(dir, 'relay.express.ts');
    await writeFile(
      routePath,
      `import { toExpressHandler } from 'relayos/express';\nimport { relay } from './relay';\n\nexport const relayHandler = toExpressHandler(relay);\n\n// In your Express app:\n// app.post('/api/webhook/:provider', relayHandler);\n`,
      'utf8',
    );
    p.log.step(`Created ${routePath}`);
  } else if (framework === 'hono') {
    const routePath = join(dir, 'relay.hono.ts');
    await writeFile(
      routePath,
      `import { Hono } from 'hono';\nimport { toHonoHandler } from 'relayos/hono';\nimport { relay } from './relay';\n\nexport const relayRoutes = new Hono();\n\nrelayRoutes.post('/api/webhook/:provider', toHonoHandler(relay));\n`,
      'utf8',
    );
    p.log.step(`Created ${routePath}`);
  } else if (framework === 'nestjs') {
    const routePath = join(dir, 'relay.controller.ts');
    await writeFile(
      routePath,
      `import { Controller, Post, Req, Res } from '@nestjs/common';\nimport { toNestJsHandler, type NestJsRelayRequest, type NestJsRelayResponse } from 'relayos/nestjs';\nimport { relay } from './relay';\n\n@Controller('api/webhook')\nexport class RelayController {\n  private readonly handler = toNestJsHandler(relay);\n\n  @Post(':provider')\n  post(@Req() req: NestJsRelayRequest, @Res() res: NestJsRelayResponse) {\n    return this.handler(req, res);\n  }\n}\n`,
      'utf8',
    );
    p.log.step(`Created ${routePath}`);
  }

  const pm = await detectPackageManager(dir);
  const packages = [
    'relayos',
    databasePackages[database as DatabaseChoice],
    ...(plugins as PluginChoice[]).map((choice) => pluginPackages[choice]),
  ];

  const spinner = p.spinner();
  spinner.start(`Installing dependencies with ${pm}`);
  await installPackages(pm, dir, packages);
  spinner.stop(`Installed ${packages.join(', ')}`);

  p.outro(
    `Done${appName && appName !== 'my-app' ? `, ${appName}` : ''}. Add a relay.on(...) call in relay.handlers.ts to get started.`,
  );
}

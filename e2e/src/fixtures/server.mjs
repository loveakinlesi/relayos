import { createServer } from 'node:http';
import { createJiti } from 'jiti';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const fixtureDir = process.argv[2];
if (!fixtureDir) {
  console.error('Usage: node server.mjs <fixtureDir>');
  process.exit(1);
}

const jiti = createJiti(pathToFileURL(join(fixtureDir, 'server.mjs')).href);
const { relay } = await jiti.import(join(fixtureDir, 'relay.ts'));

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const match = url.pathname.match(/^\/api\/relay\/([^/]+)$/);
  if (!match || req.method !== 'POST') {
    res.writeHead(404).end();
    return;
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const rawBody = Buffer.concat(chunks);

  const response = await relay.handler(
    new Request(url, { method: 'POST', headers: new Headers(req.headers), body: rawBody }),
    { params: { all: [match[1]] } },
  );

  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
});

server.listen(0, '127.0.0.1', () => {
  console.log(`listening:${server.address().port}`);
});

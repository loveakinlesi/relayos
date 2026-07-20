import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

// Set only by the GitHub Pages deploy workflow - keeps `pnpm dev`/`pnpm build`
// unaffected everywhere else (regular Next.js server build, no base path).
const isGithubPages = process.env.GITHUB_PAGES === 'true';
const basePath = isGithubPages ? '/restaq' : '';

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  ...(isGithubPages && {
    output: 'export',
    basePath,
    images: { unoptimized: true },
  }),
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
};

export default withMDX(config);

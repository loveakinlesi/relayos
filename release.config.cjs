module.exports = {
  branches: ['main'],
  plugins: [
    '@semantic-release/commit-analyzer',
    '@semantic-release/release-notes-generator',
    ['@semantic-release/changelog', { changelogFile: 'CHANGELOG.md' }],
    [
      '@semantic-release/exec',
      {
        prepareCmd:
          "node scripts/release/set-versions.mjs ${nextRelease.version} && pnpm build --filter='./packages/*'",
        publishCmd: 'node scripts/release/publish-packages.mjs',
      },
    ],
    [
      '@semantic-release/git',
      {
        assets: ['CHANGELOG.md', 'packages/*/package.json'],
        message: 'chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
      },
    ],
    '@semantic-release/github',
  ],
};

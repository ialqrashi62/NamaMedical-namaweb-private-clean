name: build

on:
  push:
    branches: [ main, 'integration/*' ]
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: cd namaweb && npm ci --no-audit --no-fund
      - run: cd namaweb && DEPLOY_TARGET=dry-run npm test -- --runInBand
      - name: Generate SBOM
        run: |
          cd namaweb
          npx --yes @cyclonedx/cyclonedx-npm --output-format json --output-file sbom.json || true
      - name: Sign image (cosign)
        if: env.IMAGE_REGISTRY != ''
        run: |
          echo "Skipping live cosign push — handled by ops/live_deploy/"
        env:
          IMAGE_REGISTRY: ${{ vars.IMAGE_REGISTRY || '' }}

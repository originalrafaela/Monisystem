#!/usr/bin/env bash
set -eu
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
npm run check
npm --prefix backend test
node qa/services.test.cjs
node qa/screens.test.cjs
node qa/regressions.test.cjs
node qa/geo.test.cjs
node qa/location.test.cjs

node qa/mobile-transport.test.cjs

node qa/migration-security.test.cjs

node src/components/__tests__/publication.test.cjs

#!/usr/bin/env bash
# exit on error
set -o errexit

npm install --prefix server
npm install --prefix client --include=dev
npm run build --prefix client

# Install Chrome for Puppeteer
node server/install-browser.js

const { join } = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // Changes the cache location for Puppeteer so Render bundles Chrome in runtime container
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};
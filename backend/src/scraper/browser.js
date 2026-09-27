import { chromium } from 'playwright';

const BLOCKED_RESOURCES = new Set(['image', 'font', 'media']);

/** One Chromium per batch (Render free has 512 MB). Always close it in `finally`. */
export function launchBrowser({ headed = false, slowMo = 0 } = {}) {
  return chromium.launch({
    headless: !headed,
    slowMo,
    args: ['--disable-dev-shm-usage', '--no-sandbox'],
  });
}

/** Fresh context per target/attempt so cookies and challenge tokens never leak between targets. */
export async function newContext(browser, { blockAssets = true } = {}) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
  });
  if (blockAssets) {
    await context.route('**/*', (route) =>
      BLOCKED_RESOURCES.has(route.request().resourceType()) ? route.abort() : route.continue(),
    );
  }
  return context;
}

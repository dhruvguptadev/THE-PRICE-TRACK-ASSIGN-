import { config, productUrl } from '../config.js';
import { newContext } from './browser.js';
import { ScrapeError, Kind } from './errors.js';
import { classifyHttpStatus } from './classify.js';
import { sameText } from './normalize.js';
import { validateExtraction } from './validate.js';

// Stable, non-rotating hooks observed on the product page (2026-09-25). Everything that
// rotates (price/stock/mrp classes, price tag) comes from the page's own UI manifest.
const SEL = {
  heading: '.pdp-summary h1',
  optionChip: '.opt-picker .opt-chip',
  offerPanel: '.offer-panel',
  unlockButton: 'button.ctl-main',
  consentScrim: '.consent-scrim',
  consentReject: '.consent-scrim button[aria-label="Reject cookies"]',
};

const CLICK_CONFIRM_MS = 2_500; // the store drops/delays ~35% of UI events by 900 ms
const MAX_CLICK_TRIES = 4;
const MAX_HOVER_ROUNDS = 4;

/**
 * One scrape attempt for one target, in a fresh browser context.
 * Returns a validated { price, mrp, currency, stockQty, rawPriceText, rawStockText, manifestRevision }
 * or throws a classified ScrapeError (which also carries manifestRevision when known).
 *
 * target = { storeProductId, productName, selectedOption, selectedOptionKey }
 */
export async function scrapePrice(browser, target, { fallbackManifest = null, priceReadyTimeoutMs = config.priceReadyTimeoutMs, log = () => {} } = {}) {
  const context = await newContext(browser);
  const page = await context.newPage();
  page.setDefaultTimeout(config.browserNavTimeoutMs);
  page.setDefaultNavigationTimeout(config.browserNavTimeoutMs);

  let manifest = fallbackManifest;
  let lastQuote = null; // { status, opt }
  page.on('response', async (res) => {
    const url = res.url();
    if (url.includes('/api/v2/ui/manifest') && res.ok()) {
      try { manifest = await res.json(); } catch { /* keep fallback */ }
    } else if (/\/api\/v2\/items\/\d+\/quote/.test(url)) {
      lastQuote = { status: res.status(), opt: new URL(url).searchParams.get('opt') };
    }
  });

  // The cookie banner appears a few seconds after load and swallows pointer events.
  // Reject it (privacy-preserving) whenever it blocks a locator action.
  await page.addLocatorHandler(page.locator(SEL.consentScrim), async () => {
    await page.locator(SEL.consentReject).click({ timeout: 5_000 }).catch(() => {});
  });

  // The page loads its own manifest on start; wait for that response rather than racing the handler.
  const pageManifest = page
    .waitForResponse((res) => res.url().includes('/api/v2/ui/manifest') && res.ok(), { timeout: config.browserNavTimeoutMs })
    .then((res) => res.json())
    .catch(() => null);

  try {
    log(`open ${productUrl(target.storeProductId)}`);
    await page.goto(productUrl(target.storeProductId), { waitUntil: 'domcontentloaded' });

    // 1. Product loaded and it is the right one.
    const heading = page.locator(SEL.heading);
    await heading.waitFor({ state: 'visible' }).catch(() => {
      throw new ScrapeError('STRUCTURE_CHANGED', 'Product heading did not render', { kind: Kind.STRUCTURE });
    });
    const pageName = (await heading.innerText()).trim();
    if (!sameText(pageName, target.productName)) {
      throw new ScrapeError('NAME_MISMATCH', `Page shows "${pageName}", expected "${target.productName}"`, { kind: Kind.PERMANENT });
    }
    const loaded = await pageManifest;
    if (loaded?.classes) manifest = loaded;
    if (!manifest?.classes) {
      throw new ScrapeError('STRUCTURE_CHANGED', 'UI manifest unavailable', { kind: Kind.STRUCTURE });
    }

    await dismissConsent(page);

    // 2. Select the tracked option (default selection varies per load).
    log(`select option "${target.selectedOption}"`);
    await selectOption(page, target.selectedOption);

    // 3. Hover the price panel with trusted mouse moves until the unlock button enables, then click it.
    const panel = page.locator(SEL.offerPanel).first();
    log('hover price panel');
    await unlockPrice(page, panel);

    // 4. Wait for the real (manifest-classed) price element to be visible and not pending.
    const { priceTag = 'output', classes } = manifest;
    const priceSelector = `${priceTag}.${classes.priceValue}`;
    log(`wait for price ${priceSelector}`);
    await waitForPriceReady(page, panel, priceSelector, priceReadyTimeoutMs, () => lastQuote);

    if (lastQuote && lastQuote.opt !== target.selectedOptionKey) {
      throw new ScrapeError('OPTION_NOT_ACTIVE', `Quote was fetched for option ${lastQuote.opt}, expected ${target.selectedOptionKey}`);
    }

    // 5. Read everything in one DOM pass and validate.
    const raw = await readOffer(page, { priceSelector, classes });
    log(`read price="${raw.priceText}" stock="${raw.stockText}" option="${raw.activeOption}"`);
    const result = validateExtraction(raw, target);
    return { ...result, manifestRevision: manifest.revision ?? null };
  } catch (error) {
    if (error && typeof error === 'object') error.manifestRevision = manifest?.revision ?? null;
    throw error;
  } finally {
    await context.close().catch(() => {});
  }
}

async function dismissConsent(page) {
  // Wait briefly for a banner that may still be about to appear; this is a condition wait, not a sleep.
  const scrim = page.locator(SEL.consentScrim);
  const appeared = await scrim.waitFor({ state: 'visible', timeout: 4_000 }).then(() => true, () => false);
  if (appeared) await page.locator(SEL.consentReject).click({ timeout: 5_000 }).catch(() => {});
}

async function selectOption(page, label) {
  const chips = page.locator(SEL.optionChip);
  await chips.first().waitFor({ state: 'visible' });
  const labels = (await chips.allInnerTexts()).map((t) => t.trim());
  const index = labels.findIndex((l) => sameText(l, label));
  if (index === -1) {
    throw new ScrapeError('OPTION_NOT_FOUND', `Option "${label}" not offered (have: ${labels.join(', ')})`, { kind: Kind.PERMANENT });
  }
  const chip = chips.nth(index);
  for (let i = 0; i < MAX_CLICK_TRIES; i++) {
    if ((await chip.getAttribute('aria-pressed')) === 'true') return;
    await chip.click();
    const pressed = await page
      .waitForFunction((el) => el.getAttribute('aria-pressed') === 'true', await chip.elementHandle(), { timeout: CLICK_CONFIRM_MS })
      .then(() => true, () => false);
    if (pressed) return;
  }
  throw new ScrapeError('OPTION_NOT_ACTIVE', `Could not activate option "${label}"`);
}

async function unlockPrice(page, panel) {
  await panel.scrollIntoViewIfNeeded();
  const button = panel.locator(SEL.unlockButton);
  for (let round = 0; round < MAX_HOVER_ROUNDS; round++) {
    await dismissConsentIfVisible(page);
    const box = await panel.boundingBox();
    if (!box) throw new ScrapeError('STRUCTURE_CHANGED', 'Price panel has no layout box', { kind: Kind.STRUCTURE });

    // Many small trusted moves inside the panel; the page needs a minimum move count and dwell time.
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5, { steps: 8 });
    for (let i = 0; i < 24; i++) {
      const x = box.x + 12 + ((i * 37 + round * 11) % Math.max(1, box.width - 24));
      const y = box.y + 12 + ((i * 17 + round * 7) % Math.max(1, box.height - 24));
      await page.mouse.move(x, y, { steps: 4 });
    }

    // Already unlocked (e.g. a previous round's click landed late)?
    if (await isOfferReady(panel)) return;

    const enabled = await button
      .first()
      .waitFor({ state: 'visible', timeout: 2_000 })
      .then(() => button.first().isEnabled(), () => false);
    if (!enabled) continue;

    await button.first().click({ timeout: 5_000 }).catch(() => {});
    const started = await page
      .waitForFunction((sel) => {
        const p = document.querySelector(sel);
        return p && !p.className.includes('offer-locked');
      }, SEL.offerPanel, { timeout: CLICK_CONFIRM_MS })
      .then(() => true, () => false);
    if (started) return;
  }
  throw new ScrapeError('CHALLENGE_TIMEOUT', 'Price stayed locked after repeated hover + unlock attempts');
}

async function dismissConsentIfVisible(page) {
  if (await page.locator(SEL.consentScrim).isVisible().catch(() => false)) {
    await page.locator(SEL.consentReject).click({ timeout: 5_000 }).catch(() => {});
  }
}

async function isOfferReady(panel) {
  const cls = (await panel.getAttribute('class').catch(() => '')) || '';
  return cls.includes('offer-ready');
}

async function waitForPriceReady(page, panel, priceSelector, timeoutMs, getQuote) {
  const ready = await page
    .waitForFunction(
      ([panelSel, priceSel]) => {
        const p = document.querySelector(panelSel);
        if (!p || !p.className.includes('offer-ready')) return false;
        const el = [...p.querySelectorAll(priceSel)].find((e) => e.offsetParent !== null);
        if (!el) return false;
        return Number(getComputedStyle(el).opacity) >= 0.99 && el.innerText.trim() !== '';
      },
      [SEL.offerPanel, priceSelector],
      { timeout: timeoutMs, polling: 200 },
    )
    .then(() => true, () => false);
  if (ready) return;

  // Explain why it never became ready.
  const quote = getQuote();
  if (quote && (quote.status === 401 || quote.status === 403)) {
    throw new ScrapeError('CHALLENGE_FAILED', `Price request rejected (${quote.status})`, { httpStatus: quote.status });
  }
  if (quote && quote.status >= 400) {
    const err = classifyHttpStatus(quote.status, 'price quote');
    err.kind = Kind.TRANSIENT; // the product itself exists; a failing quote is worth retrying
    throw err;
  }
  const panelText = ((await panel.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').slice(0, 200);
  // The price element exists but never became readable (still dimmed/empty): a load problem, not a page shift.
  const stuck = await panel.locator(priceSelector).evaluateAll((els) => els
    .filter((e) => e.offsetParent !== null)
    .map((e) => ({ opacity: getComputedStyle(e).opacity, text: e.innerText.replace(/[\u200B\s]+/g, ''), style: e.getAttribute('style') })),
  ).catch(() => []);
  if (stuck.length) {
    throw new ScrapeError('PRICE_NOT_READY', `Price never settled within ${timeoutMs} ms: ${JSON.stringify(stuck).slice(0, 400)} (panel: "${panelText}")`);
  }
  if (await isOfferReady(panel)) {
    // Panel says ready but the manifest-classed price element is missing: the page shifted.
    // Record which elements the price row did contain, for diagnosing the shift from the log.
    const found = await panel.locator('.offer-row > *').evaluateAll((els) =>
      els.map((e) => `${e.tagName.toLowerCase()}.${[...e.classList].join('.')}${e.offsetParent === null ? '(hidden)' : ''}`).join(' '),
    ).catch(() => '?');
    throw new ScrapeError('STRUCTURE_CHANGED', `Price element ${priceSelector} not found in ready panel (row: ${found})`, { kind: Kind.STRUCTURE });
  }
  throw new ScrapeError('CHALLENGE_TIMEOUT', `Price did not load within ${timeoutMs} ms (panel: "${panelText}")`);
}

/** Single DOM read. Only visible, manifest-classed elements count; hidden decoys are ignored. */
export function readOffer(page, { priceSelector, classes }) {
  return page.evaluate(
    ({ SEL, priceSelector, classes }) => {
      const visible = (el) => {
        if (!el || el.offsetParent === null) return false;
        const s = getComputedStyle(el);
        return s.display !== 'none' && s.visibility !== 'hidden' && el.getAttribute('aria-hidden') !== 'true';
      };
      const panel = document.querySelector(SEL.offerPanel);
      const prices = panel ? [...panel.querySelectorAll(priceSelector)].filter(visible) : [];
      const priceEl = prices.length === 1 ? prices[0] : null;
      const mrpEl = panel ? [...panel.querySelectorAll(`.${classes.mrp}`)].find(visible) : null;
      const stockEl = panel ? [...panel.querySelectorAll(`.${classes.stock}`)].find(visible) : null;
      const activeChip = document.querySelector(`${SEL.optionChip}[aria-pressed="true"]`);
      return {
        pageName: document.querySelector(SEL.heading)?.innerText ?? '',
        activeOption: activeChip?.innerText ?? '',
        priceCount: prices.length,
        priceText: priceEl ? priceEl.textContent : null,
        priceVisible: !!priceEl,
        pricePending: priceEl ? Number(getComputedStyle(priceEl).opacity) < 0.99 : true,
        priceIsDecoy: priceEl
          ? priceEl.classList.contains('price-value') || priceEl.hasAttribute('data-price') || priceEl.getAttribute('aria-hidden') === 'true'
          : false,
        mrpText: mrpEl ? mrpEl.textContent : null,
        stockText: stockEl ? stockEl.innerText : null,
        stockSoldOut: !!stockEl?.querySelector('.avail-no'),
      };
    },
    { SEL, priceSelector, classes },
  ).then((raw) => {
    if (raw.priceCount !== 1) {
      throw new ScrapeError('STRUCTURE_CHANGED', `Expected exactly 1 visible price element, found ${raw.priceCount}`, { kind: Kind.STRUCTURE });
    }
    if (raw.stockText === null) {
      throw new ScrapeError('STRUCTURE_CHANGED', `Stock element .${classes.stock} not found`, { kind: Kind.STRUCTURE, rawPriceText: raw.priceText });
    }
    return raw;
  });
}

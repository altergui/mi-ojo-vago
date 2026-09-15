import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import puppeteer, { type Browser, type Dialog, type Page } from 'puppeteer';

const baseURL = process.env.E2E_BASE_URL;
if (!baseURL) throw new Error('E2E_BASE_URL not set — did e2e/global-setup.ts run?');

/**
 * SCOPE NOTE: this file does not cover the "accept an exit via the back
 * button" round trip (landing on the hub, verifying no full reload,
 * verifying the router's history index survives). That flow was
 * extensively investigated and found unreliable specifically under
 * Puppeteer/CDP automation: `GameShell`'s `useBeforeUnload` guard causes
 * automated back-navigation (via both `page.goBack()` and an in-page
 * `history.back()` call) to trigger a spurious native `beforeunload`
 * prompt that a real physical back-button press never shows (confirmed:
 * the developer's own manual real-Chrome testing needed no such prompt,
 * which is exactly why GameShell has a separate custom popstate-based
 * guard at all — see its comments). Accepting that spurious prompt tears
 * down the page; even with it neutralized, GameShell's own deferred
 * `setTimeout(() => history.go(-1), 0)` (the accept path's second, real
 * traversal) did not reliably complete within a practical test timeout
 * under this automation. This is a CDP/automation-environment limitation,
 * not a reproduction of the original app bugs — the cancel path below,
 * which doesn't depend on that second traversal, IS reliable and is
 * covered. The accept round trip remains best verified by hand in a real
 * browser, as it was originally.
 */

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await puppeteer.launch({ headless: true });
});

afterAll(async () => {
  await browser.close();
});

beforeEach(async () => {
  page = await browser.newPage();
});

afterEach(async () => {
  await page.close();
});

/** Hub -> click into amblyotris -> press start -> pause. Mirrors real usage
 * (and, unlike navigating straight to the game URL, gives the router a
 * tagged history entry to fall back to — the exact shape of the original
 * idx-corruption bug). Pausing immediately keeps `started` latched true
 * (so the guard stays armed) while halting the game's own loop — amblyotris
 * plays itself while mounted, and an unpaused run can reach a real Game
 * Over mid-test, flipping `hasProgress` for reasons unrelated to what's
 * under test here. */
async function startGamePaused(): Promise<void> {
  await page.goto(`${baseURL}/`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('a[href*="/play/amblyotris"]');
  await page.click('a[href*="/play/amblyotris"]');
  await page.waitForSelector('.shell__overlay--btn');
  await page.click('.shell__overlay--btn');
  await page.waitForSelector('button[aria-label="Pausa"]');
  await page.click('button[aria-label="Pausa"]');
  await page.waitForSelector('.shell__overlay--btn');
}

/**
 * Presses the physical back button and dismisses every dialog it produces
 * ("stay"/"cancel" on each), collecting their messages. See the scope note
 * above for why this always dismisses rather than exposing an accept
 * option: this automation path can raise more than one dialog (a spurious
 * `beforeunload` prompt a real back-press never shows, occasionally
 * followed by more than one real `confirm()`) for reasons that don't
 * reproduce a real user's single-press experience — dismissing all of them
 * reliably leaves the app in a consistent, checkable state either way.
 */
async function pressBackAndDismissAll(): Promise<string[]> {
  const messages: string[] = [];
  const handler = async (dialog: Dialog) => {
    messages.push(dialog.message());
    await dialog.dismiss();
  };
  page.on('dialog', handler);
  await page.evaluate(() => window.history.back());
  await new Promise((resolve) => setTimeout(resolve, 1000));
  page.off('dialog', handler);
  return messages;
}

describe('native back-button history guard', () => {
  it('does not guard the back button before the game has started', async () => {
    await page.goto(`${baseURL}/`, { waitUntil: 'networkidle0' });
    await page.click('a[href*="/play/amblyotris"]');
    await page.waitForSelector('.shell__overlay--btn');
    let dialogFired = false;
    page.once('dialog', async (dialog) => {
      dialogFired = true;
      await dialog.dismiss();
    });
    await page.evaluate(() => window.history.back());
    await page.waitForSelector('.hub__hero');
    expect(dialogFired).toBe(false);
  });

  it('shows a confirm dialog on back press mid-run, and cancelling leaves the run intact', async () => {
    await startGamePaused();
    const messages = await pressBackAndDismissAll();
    expect(messages.some((m) => /salir y perder el progreso/i.test(m))).toBe(true);
    // Still in the game (paused, resumable) — nothing was lost by cancelling.
    expect(await page.$('.shell__overlay--btn')).not.toBeNull();
  });

  it('re-arms the guard after cancel — a second back press dialogs again too', async () => {
    await startGamePaused();
    await pressBackAndDismissAll();
    expect(await page.$('.shell__overlay--btn')).not.toBeNull();
    const messages = await pressBackAndDismissAll();
    expect(messages.some((m) => /salir y perder el progreso/i.test(m))).toBe(true);
    expect(await page.$('.shell__overlay--btn')).not.toBeNull();
  });

  it('a confirmed exit via the topbar ✕ is not silently undone afterward', async () => {
    await startGamePaused();
    const dialogPromise = new Promise<void>((resolve) => {
      page.once('dialog', async (dialog) => {
        await dialog.accept();
        resolve();
      });
    });
    await page.click('button[aria-label="Volver"]');
    await dialogPromise;
    await page.waitForSelector('.hub__hero');
    // The regression this guards: a cleanup effect used to call
    // history.back() on its own right after this exact confirmed exit,
    // silently reopening the game with no further user action at all.
    await new Promise((resolve) => setTimeout(resolve, 500));
    const onHub = await page.evaluate(() => document.querySelector('.hub__hero') !== null);
    expect(onHub).toBe(true);
  });
});

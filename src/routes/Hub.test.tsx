// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import { Hub } from './Hub';

const SCROLL_KEY = 'hub-scroll-y';

function renderHub() {
  return render(
    <I18nProvider>
      <MemoryRouter>
        <Hub />
      </MemoryRouter>
    </I18nProvider>
  );
}

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('hub scroll restoration', () => {
  it('restores a saved scroll position on mount', () => {
    sessionStorage.setItem(SCROLL_KEY, '480');
    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    // Hub re-nudges scrollTo on the next animation frame too (see its
    // comment on lazy-loaded card images still growing page height). Run it
    // synchronously so it fires — and gets asserted on — within this test,
    // rather than leaking into a later tick after scrollTo is unmocked
    // (jsdom doesn't implement a real scrollTo and logs noise otherwise).
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    renderHub();
    expect(scrollToSpy).toHaveBeenCalledWith(0, 480);
  });

  it('does not call scrollTo when nothing was saved', () => {
    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    renderHub();
    expect(scrollToSpy).not.toHaveBeenCalled();
  });

  it('saves the current scroll position when leaving, regardless of how', () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const { unmount } = renderHub();
    // Simulate the user having scrolled: set the property directly (jsdom
    // doesn't do real layout/scroll physics) and fire the same 'scroll'
    // event the browser would, since Hub tracks position via that listener
    // rather than reading window.scrollY at unmount time.
    Object.defineProperty(window, 'scrollY', { value: 733, configurable: true });
    window.dispatchEvent(new Event('scroll'));
    unmount();
    expect(sessionStorage.getItem(SCROLL_KEY)).toBe('733');
  });
});

import { describe, expect, it } from 'vitest';
import { shouldRefreshToolbarIcon } from '@/lib/navIconRefresh';

describe('shouldRefreshToolbarIcon', () => {
  it('returns true on reload even when hostname is unchanged', () => {
    expect(
      shouldRefreshToolbarIcon({
        lastHostname: 'example.com',
        url: 'https://example.com/foo',
        transitionType: 'reload',
        frameId: 0,
      }),
    ).toBe(true);
  });

  it('returns false on same-host navigation with path-only change', () => {
    expect(
      shouldRefreshToolbarIcon({
        lastHostname: 'example.com',
        url: 'https://example.com/bar?q=1',
        transitionType: 'link',
        frameId: 0,
      }),
    ).toBe(false);
  });

  it('returns true when hostname changes (subdomain)', () => {
    expect(
      shouldRefreshToolbarIcon({
        lastHostname: 'example.com',
        url: 'https://b.example.com/',
        transitionType: 'link',
        frameId: 0,
      }),
    ).toBe(true);
  });

  it('returns false for unsupported URLs', () => {
    expect(
      shouldRefreshToolbarIcon({
        lastHostname: 'example.com',
        url: 'chrome://extensions/',
        transitionType: 'link',
        frameId: 0,
      }),
    ).toBe(false);
  });

  it('returns false when frameId is not main frame', () => {
    expect(
      shouldRefreshToolbarIcon({
        lastHostname: null,
        url: 'https://example.com/',
        transitionType: 'link',
        frameId: 1,
      }),
    ).toBe(false);
  });

  it('treats first checkable host as a change when lastHostname is null', () => {
    expect(
      shouldRefreshToolbarIcon({
        lastHostname: null,
        url: 'https://a.com/path',
        transitionType: 'typed',
        frameId: 0,
      }),
    ).toBe(true);
  });
});

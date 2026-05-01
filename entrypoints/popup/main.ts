import './style.css';
import {
  runDnsCheck,
  type CheckMode,
  type CheckResult,
} from '@/lib/checkDomain';
import { getActiveTabHostname } from '@/lib/tabHost';
import type { FullScore, GradeLine, HealthStatus } from '@/lib/score';
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type ExtensionSettings,
  type ToolbarIconDriver,
} from '@/lib/settings';
import {
  applyToolbarIconForTab,
  resetToolbarIconForTab,
} from '@/lib/toolbarIcon';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('#app missing');
const root = app;

let tabHostname = '';
let activeTabId: number | null = null;
let settings: ExtensionSettings = { ...DEFAULT_SETTINGS };
let currentView: 'main' | 'settings' = 'main';
let lastMode: CheckMode = 'apex';
let lastResult: CheckResult | null = null;

const COG_SVG = `<svg class="fab__icon" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.14.48.5.87.97 1.05V10a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>`;

function fabSettingsButton(): string {
  return `
    <button type="button" class="fab" id="btn-open-settings" aria-label="Settings">
      ${COG_SVG}
    </button>
  `;
}

/** Loading / error: footer with settings only (matches results footer placement pattern). */
function shellWithFabFooterOnly(bodyHtml: string): string {
  return `
    <div class="shell shell--with-fab">
      ${bodyHtml}
      <footer class="footer footer--fab-only">
        <div class="fab-row fab-row--footer">
          ${fabSettingsButton()}
        </div>
      </footer>
    </div>
  `;
}

async function syncToolbarIconFromResult(result: CheckResult): Promise<void> {
  if (activeTabId == null) return;
  if (settings.coloredToolbarIcon) {
    await applyToolbarIconForTab(
      activeTabId,
      result.full,
      settings.toolbarIconDriver,
    );
  } else {
    await resetToolbarIconForTab(activeTabId);
  }
}

async function clearToolbarIconIfPossible(): Promise<void> {
  if (activeTabId == null) return;
  await resetToolbarIconForTab(activeTabId);
}

function badgeClass(status: HealthStatus): string {
  return `badge badge--${status}`;
}

function statusLabel(status: HealthStatus): string {
  switch (status) {
    case 'pass':
      return 'Pass';
    case 'warn':
      return 'Warning';
    case 'fail':
      return 'Fail';
    case 'missing':
      return 'Missing';
  }
}

function truncate(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function mxtoolboxEmailHealthUrl(domain: string): string {
  return `https://mxtoolbox.com/emailhealth/${encodeURIComponent(domain)}`;
}

function renderScoreRing(overall: number): string {
  const pct = Math.min(100, Math.max(0, (overall / 10) * 100));
  const deg = (pct / 100) * 360;
  return `
    <div class="score-ring" style="--score-deg: ${deg}deg" aria-hidden="true">
      <div class="score-ring__inner">
        <span class="score-ring__value">${overall.toFixed(1)}</span>
        <span class="score-ring__max">/ 10</span>
      </div>
    </div>
  `;
}

function renderGradeBreakdown(lines: GradeLine[]): string {
  if (!lines.length) return '';
  return `<ul class="breakdown" aria-label="Grading details">${lines
    .map(
      (l) =>
        `<li class="breakdown__item breakdown__item--${l.status}">${escapeHtml(l.text)}</li>`,
    )
    .join('')}</ul>`;
}

function renderProtocolCard(
  title: string,
  score: FullScore['spf'],
  rawLabel: string,
  rawSnippet: string | null,
  breakdown: GradeLine[],
): string {
  const rawBlock = rawSnippet
    ? `<details class="raw"><summary>${rawLabel}</summary><pre class="raw__pre">${escapeHtml(truncate(rawSnippet, 900))}</pre></details>`
    : '';
  return `
    <article class="card">
      <div class="card__head">
        <h3 class="card__title">${title}</h3>
        <span class="${badgeClass(score.status)}">${statusLabel(score.status)}</span>
      </div>
      <div class="card__points">${score.points.toFixed(1)} <span class="card__max">/ ${score.max}</span></div>
      <p class="card__detail">${escapeHtml(score.detail)}</p>
      ${renderGradeBreakdown(breakdown)}
      ${rawBlock}
    </article>
  `;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function modeChips(mode: CheckMode): string {
  return `
    <div class="mode-row" role="group" aria-label="DNS query scope">
      <button type="button" class="chip ${mode === 'apex' ? 'chip--active' : ''}" id="btn-mode-apex" ${mode === 'apex' ? 'aria-current="true"' : ''}>
        Root domain
      </button>
      <button type="button" class="chip ${mode === 'exact' ? 'chip--active' : ''}" id="btn-mode-exact" ${mode === 'exact' ? 'aria-current="true"' : ''}>
        Tab hostname
      </button>
    </div>
  `;
}

function loadingLabel(mode: CheckMode, tab: string): string {
  if (mode === 'apex') {
    return 'Checking root domain (subdomains and www stripped)…';
  }
  return `Checking exact hostname ${tab}…`;
}

function renderLoading(mode: CheckMode): void {
  root.innerHTML = shellWithFabFooterOnly(`
      <header class="header">
        <h1 class="header__title">DNS Health</h1>
        <p class="header__sub mono">Tab: ${escapeHtml(tabHostname)}</p>
        ${modeChips(mode)}
        <p class="header__hint">${escapeHtml(loadingLabel(mode, tabHostname))}</p>
      </header>
      <div class="loading">
        <div class="loading__pulse"></div>
        <p>Querying public DNS (DoH)…</p>
      </div>
  `);
  bindModeButtons(mode, true);
  bindSettingsFab();
}

function renderError(message: string): void {
  void clearToolbarIconIfPossible();
  root.innerHTML = shellWithFabFooterOnly(`
      <header class="header">
        <h1 class="header__title">DNS Health</h1>
      </header>
      <div class="panel panel--warn">
        <p class="panel__text">${escapeHtml(message)}</p>
      </div>
  `);
  bindSettingsFab();
}

function renderMailInfraCard(
  title: string,
  status: HealthStatus,
  summary: string,
  lines: string[],
  raw?: string,
): string {
  const rawBlock = raw
    ? `<details class="raw"><summary>Raw</summary><pre class="raw__pre">${escapeHtml(truncate(raw, 900))}</pre></details>`
    : '';
  const lineBlock = lines.length
    ? `<ul class="mail-infra-lines">${lines.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}</ul>`
    : '';
  return `
    <article class="card card--compact">
      <div class="card__head">
        <h3 class="card__title">${title}</h3>
        <span class="${badgeClass(status)}">${statusLabel(status)}</span>
      </div>
      <p class="card__detail mail-infra-summary">${escapeHtml(summary)}</p>
      ${lineBlock}
      ${rawBlock}
    </article>
  `;
}

function dmarcHint(result: CheckResult): string {
  return `DMARC is always read from _dmarc.${result.dmarcLookupHost} (organizational domain of the tab). SPF and DKIM use ${result.queryHostname}.`;
}

function renderResult(result: CheckResult): void {
  const { full } = result;
  const dkimRaw = result.dkim.raw;
  const tabDiffers = result.tabHostname !== result.queryHostname;

  root.innerHTML = `
    <div class="shell shell--with-fab">
      <header class="header">
        <h1 class="header__title">DNS Health</h1>
        <p class="header__sub mono">Tab: ${escapeHtml(result.tabHostname)}</p>
        ${modeChips(result.mode)}
        <p class="header__host mono">SPF / DKIM: ${escapeHtml(result.queryHostname)}</p>
        ${tabDiffers ? `<p class="header__hint">Root check uses the registrable domain; switch to <strong>Tab hostname</strong> to score <span class="mono">${escapeHtml(result.tabHostname)}</span>.</p>` : ''}
        <p class="header__hint">${escapeHtml(dmarcHint(result))}</p>
      </header>

      <section class="hero">
        ${renderScoreRing(full.overall)}
        <p class="hero__label">SPF + DMARC + DKIM (max 10)</p>
      </section>

      <div class="cards">
        ${renderProtocolCard(
          'SPF',
          full.spf,
          'SPF record',
          result.spfRecords[0] ?? null,
          result.spfBreakdown,
        )}
        ${renderProtocolCard(
          'DMARC',
          full.dmarc,
          'DMARC record',
          result.dmarcRecords[0] ?? null,
          result.dmarcBreakdown,
        )}
        ${renderProtocolCard(
          'DKIM',
          full.dkim,
          `DKIM (${escapeHtml(result.dkim.selector)})`,
          dkimRaw,
          result.dkimBreakdown,
        )}
      </div>

      <section class="section-more">
        <h2 class="section-more__title">More DNS checks</h2>
        <p class="section-more__hint">Same categories as <a href="https://github.com/johnduprey/DNSHealth" target="_blank" rel="noreferrer">DNSHealth</a> (MX, NS, MTA-STS TXT, TLS-RPT, DNSSEC) plus one HTTPS call to Microsoft Entra OpenID Provider Configuration (<span class="mono">login.microsoftonline.com/&lt;domain&gt;/v2.0/.well-known/openid-configuration</span>). DNS lookups use <span class="mono">${escapeHtml(result.dmarcLookupHost)}</span> (organizational domain).</p>
        <div class="cards cards--dense">
          ${result.mailInfra
            .map((c) =>
              renderMailInfraCard(
                c.title,
                c.status,
                c.summary,
                c.lines,
                c.raw,
              ),
            )
            .join('')}
        </div>
      </section>

      <footer class="footer">
        <p>
          Cross-check on
          <a href="${mxtoolboxEmailHealthUrl(result.dmarcLookupHost)}" target="_blank" rel="noreferrer noopener">MXToolbox Email Health</a>
          for <span class="mono">${escapeHtml(result.dmarcLookupHost)}</span>.
        </p>
        <p>DNS queries use DNS-over-HTTPS (Cloudflare / Google). Entra probe uses HTTPS only — no MTA-STS policy files or cert inspection. DKIM uses common selectors only.</p>
        <div class="fab-row fab-row--footer">
          ${fabSettingsButton()}
        </div>
      </footer>
    </div>
  `;
  bindModeButtons(result.mode, false);
  bindSettingsFab();
}

function renderSettings(): void {
  root.innerHTML = `
    <div class="shell shell--settings">
      <header class="settings-header">
        <button type="button" class="settings-back" id="btn-settings-back" aria-label="Back to results">
          ← Back
        </button>
        <h1 class="settings-header__title">Settings</h1>
      </header>
      <div class="settings-body">
        <label class="settings-row">
          <span class="settings-row__text">
            <strong>Colored toolbar icon</strong>
            <span class="settings-row__hint">Good (check) / bad (X) glyphs from SPF, DMARC, and DKIM. Turn off to use a neutral gray icon.</span>
          </span>
          <input type="checkbox" id="setting-colored-icon" ${settings.coloredToolbarIcon ? 'checked' : ''} />
        </label>
        <fieldset class="settings-fieldset">
          <legend class="settings-fieldset__legend">Toolbar icon driver</legend>
          <p class="settings-fieldset__hint">Choose which result turns the icon red/green, or keep the default three-column view.</p>
          <label class="settings-radio">
            <input type="radio" name="toolbar-icon-driver" value="combined" ${settings.toolbarIconDriver === 'combined' ? 'checked' : ''} />
            <span><strong>Combined</strong> — SPF, DMARC, and DKIM (one glyph each)</span>
          </label>
          <label class="settings-radio">
            <input type="radio" name="toolbar-icon-driver" value="spf" ${settings.toolbarIconDriver === 'spf' ? 'checked' : ''} />
            <span><strong>SPF only</strong></span>
          </label>
          <label class="settings-radio">
            <input type="radio" name="toolbar-icon-driver" value="dmarc" ${settings.toolbarIconDriver === 'dmarc' ? 'checked' : ''} />
            <span><strong>DMARC only</strong></span>
          </label>
          <label class="settings-radio">
            <input type="radio" name="toolbar-icon-driver" value="dkim" ${settings.toolbarIconDriver === 'dkim' ? 'checked' : ''} />
            <span><strong>DKIM only</strong></span>
          </label>
        </fieldset>
        <label class="settings-row">
          <span class="settings-row__text">
            <strong>Treat DNS resolution errors as failure</strong>
            <span class="settings-row__hint">When off, SERVFAIL and lookup errors are treated like empty TXT (older behavior).</span>
          </span>
          <input type="checkbox" id="setting-dns-errors-fail" ${settings.treatDnsResolutionErrorsAsFailure ? 'checked' : ''} />
        </label>
      </div>
    </div>
  `;

  document.getElementById('btn-settings-back')?.addEventListener('click', () => {
    currentView = 'main';
    if (lastResult) {
      renderResult(lastResult);
      void syncToolbarIconFromResult(lastResult);
    } else {
      void runCheck(lastMode);
    }
  });

  const colored = document.getElementById(
    'setting-colored-icon',
  ) as HTMLInputElement | null;
  colored?.addEventListener('change', () => {
    void persistSettingsAndRefresh({
      coloredToolbarIcon: colored.checked,
    });
  });

  const dnsFail = document.getElementById(
    'setting-dns-errors-fail',
  ) as HTMLInputElement | null;
  dnsFail?.addEventListener('change', () => {
    void persistSettingsAndRefresh({
      treatDnsResolutionErrorsAsFailure: dnsFail.checked,
    });
  });

  document
    .querySelectorAll<HTMLInputElement>('input[name="toolbar-icon-driver"]')
    .forEach((el) => {
      el.addEventListener('change', () => {
        if (!el.checked) return;
        void persistSettingsAndRefresh({
          toolbarIconDriver: el.value as ToolbarIconDriver,
        });
      });
    });
}

function bindSettingsFab(): void {
  document.getElementById('btn-open-settings')?.addEventListener('click', () => {
    currentView = 'settings';
    renderSettings();
  });
}

async function persistSettingsAndRefresh(
  partial: Partial<ExtensionSettings>,
): Promise<void> {
  settings = { ...settings, ...partial };
  await saveSettings(settings);
  if (!tabHostname) return;
  if (currentView === 'settings') {
    try {
      const result = await runDnsCheck(tabHostname, lastMode, {
        treatDnsResolutionErrorsAsFailure:
          settings.treatDnsResolutionErrorsAsFailure,
      });
      lastResult = result;
      await syncToolbarIconFromResult(result);
    } catch {
      /* keep prior lastResult */
    }
    return;
  }
  await runCheck(lastMode);
}

function bindModeButtons(mode: CheckMode, loading: boolean): void {
  const apex = document.getElementById('btn-mode-apex');
  const exact = document.getElementById('btn-mode-exact');
  if (loading) {
    apex?.addEventListener('click', () => void runCheck('apex'));
    exact?.addEventListener('click', () => void runCheck('exact'));
    return;
  }
  apex?.addEventListener('click', () => {
    if (mode !== 'apex') void runCheck('apex');
  });
  exact?.addEventListener('click', () => {
    if (mode !== 'exact') void runCheck('exact');
  });
}

async function runCheck(mode: CheckMode): Promise<void> {
  lastMode = mode;
  renderLoading(mode);
  try {
    const result = await runDnsCheck(tabHostname, mode, {
      treatDnsResolutionErrorsAsFailure:
        settings.treatDnsResolutionErrorsAsFailure,
    });
    lastResult = result;
    await syncToolbarIconFromResult(result);
    if (currentView === 'settings') {
      return;
    }
    renderResult(result);
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : 'Something went wrong fetching DNS.';
    renderError(msg);
  }
}

async function main(): Promise<void> {
  settings = await loadSettings();
  const tab = await getActiveTabHostname();
  if (!tab.ok) {
    activeTabId = null;
    renderError(tab.reason);
    return;
  }
  tabHostname = tab.host;
  activeTabId = tab.tabId;
  currentView = 'main';
  lastResult = null;
  await runCheck('apex');
}

void main();

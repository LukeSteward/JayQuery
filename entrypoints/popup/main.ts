import './style.css';
import {
  runDnsCheck,
  type CheckMode,
  type CheckResult,
} from '@/lib/checkDomain';
import type { SpfMailProviderHint } from '@/lib/checks/mailProviderSpfHint';
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

const COPY_CLIPBOARD_SVG = `<svg class="mail-infra-copy__icon" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;

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

/** Same rounding as overall score; omit trailing “.0” for whole numbers. */
function formatScoreTenth(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

function mxtoolboxEmailHealthUrl(domain: string): string {
  return `https://mxtoolbox.com/emailhealth/${encodeURIComponent(domain)}`;
}

const WALL_OF_SHAME_REPO = 'jkerai1/DMARC-WallOfShame';

function wallOfShameNewIssueUrl(company: string, result: CheckResult): string {
  const domain = result.dmarcLookupHost;
  const title = `${company} — ${domain}`;
  const bodyParts = [
    `**Company:** ${company}`,
    `**Domain:** ${domain}`,
  ];
  if (result.queryHostname !== result.dmarcLookupHost) {
    bodyParts.push(`**Checked hostname:** ${result.queryHostname}`);
  }
  bodyParts.push('', '_Submitted via JayQuery browser extension._');
  const body = bodyParts.join('\n');
  const params = new URLSearchParams({ title, body });
  return `https://github.com/${WALL_OF_SHAME_REPO}/issues/new?${params}`;
}

/** Opens a URL from a user gesture (e.g. modal submit) without extra extension permissions. */
function openUrlInNewTab(url: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noreferrer noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function renderResultFooterActions(result: CheckResult): string {
  const showCastShame = result.full.dmarc.status === 'fail';
  const castShameBtn = showCastShame
    ? `<button type="button" class="footer-action-btn footer-action-btn--shame" id="btn-cast-shame">Cast shame</button>`
    : '';
  return `
    <div class="fab-row fab-row--footer fab-row--split">
      <div class="footer-actions">
        <a class="footer-action-btn footer-action-btn--link" href="${mxtoolboxEmailHealthUrl(result.dmarcLookupHost)}" target="_blank" rel="noreferrer noopener">Crosscheck on MXToolbox</a>
        ${castShameBtn}
      </div>
      ${fabSettingsButton()}
    </div>
  `;
}

function renderCastShameModal(result: CheckResult): string {
  return `
    <div class="cast-shame-modal" id="cast-shame-modal" hidden aria-hidden="true">
      <div class="cast-shame-modal__backdrop" id="cast-shame-backdrop" aria-hidden="true"></div>
      <div class="cast-shame-modal__panel" role="dialog" aria-modal="true" aria-labelledby="cast-shame-heading">
        <h2 class="cast-shame-modal__title" id="cast-shame-heading">Submit to DMARC wall of Shame</h2>
        <p class="cast-shame-modal__lede">Please submit the company name for the DMARC issue.</p>
        <label class="cast-shame-modal__label" for="cast-shame-company">Company name</label>
        <input type="text" class="cast-shame-modal__input" id="cast-shame-company" autocomplete="organization" maxlength="160" placeholder="e.g. Acme Corp" />
        <p class="cast-shame-modal__error" id="cast-shame-error" hidden role="alert">Enter a company name.</p>
        <div class="cast-shame-modal__actions">
          <button type="button" class="cast-shame-modal__btn cast-shame-modal__btn--ghost" id="cast-shame-cancel">Cancel</button>
          <button type="button" class="cast-shame-modal__btn cast-shame-modal__btn--primary" id="cast-shame-submit">Continue to GitHub</button>
        </div>
      </div>
    </div>
  `;
}

function bindCastShameModal(result: CheckResult): void {
  const openBtn = document.getElementById('btn-cast-shame');
  const modal = document.getElementById('cast-shame-modal');
  const backdrop = document.getElementById('cast-shame-backdrop');
  const cancel = document.getElementById('cast-shame-cancel');
  const submit = document.getElementById('cast-shame-submit');
  const inputEl = document.getElementById('cast-shame-company');
  const errEl = document.getElementById('cast-shame-error');
  if (
    !openBtn ||
    !modal ||
    !backdrop ||
    !cancel ||
    !submit ||
    !(inputEl instanceof HTMLInputElement) ||
    !errEl
  ) {
    return;
  }

  const modalRoot = modal;
  const openerBtn = openBtn;
  const shameInput = inputEl;
  const shameErr = errEl;

  function closeModal(): void {
    modalRoot.hidden = true;
    modalRoot.setAttribute('aria-hidden', 'true');
    shameInput.value = '';
    shameErr.hidden = true;
    openerBtn.focus();
  }

  function openModal(): void {
    shameErr.hidden = true;
    modalRoot.hidden = false;
    modalRoot.setAttribute('aria-hidden', 'false');
    shameInput.focus();
  }

  openerBtn.addEventListener('click', openModal);
  backdrop.addEventListener('click', closeModal);
  cancel.addEventListener('click', closeModal);

  submit.addEventListener('click', () => {
    const trimmed = shameInput.value.trim();
    if (!trimmed) {
      shameErr.hidden = false;
      shameInput.focus();
      return;
    }
    openUrlInNewTab(wallOfShameNewIssueUrl(trimmed, result));
    closeModal();
  });

  modalRoot.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeModal();
    }
  });

  shameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit.click();
    }
  });
}

function renderScoreRing(overall: number): string {
  const pct = Math.min(100, Math.max(0, (overall / 10) * 100));
  const deg = (pct / 100) * 360;
  return `
    <div class="score-ring" style="--score-deg: ${deg}deg" aria-hidden="true">
      <div class="score-ring__inner">
        <span class="score-ring__value">${formatScoreTenth(overall)}</span>
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

function renderSpfMailProviderHint(h: SpfMailProviderHint): string {
  const lineBlock = h.lines.length
    ? `<ul class="spf-provider-hint__lines">${h.lines
        .map((t) => `<li>${escapeHtml(t)}</li>`)
        .join('')}</ul>`
    : '';
  return `
    <div class="spf-provider-hint" role="note" aria-label="MX provider SPF reference (not scored)">
      <p class="spf-provider-hint__kicker">MX provider profile — not part of score</p>
      <div class="spf-provider-hint__head">
        <span class="spf-provider-hint__provider">${escapeHtml(h.providerName)}</span>
        <span class="${badgeClass(h.status)}">${statusLabel(h.status)}</span>
      </div>
      <p class="spf-provider-hint__summary">${escapeHtml(h.summary)}</p>
      ${lineBlock}
    </div>`;
}

function renderProtocolCard(
  title: string,
  score: FullScore['spf'],
  rawLabel: string,
  rawSnippet: string | null,
  breakdown: GradeLine[],
  titleInfoTitle?: string,
  supplementalFooter?: string,
): string {
  const rawBlock = rawSnippet
    ? `<details class="raw"><summary>${rawLabel}</summary><pre class="raw__pre">${escapeHtml(truncate(rawSnippet, 900))}</pre></details>`
    : '';
  const titleHtml = titleInfoTitle
    ? `<div class="card__title-group">
        <h3 class="card__title">${title}</h3>
        <button type="button" class="card__info" title="${escapeHtml(titleInfoTitle)}" aria-label="${escapeHtml(titleInfoTitle)}">?</button>
      </div>`
    : `<h3 class="card__title">${title}</h3>`;
  return `
    <article class="card">
      <div class="card__head">
        ${titleHtml}
        <span class="${badgeClass(score.status)}">${statusLabel(score.status)}</span>
      </div>
      <div class="card__points">${formatScoreTenth(score.points)} <span class="card__max">/ ${score.max}</span></div>
      <p class="card__detail">${escapeHtml(score.detail)}</p>
      ${renderGradeBreakdown(breakdown)}
      ${rawBlock}
      ${supplementalFooter ?? ''}
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

function renderHeaderBrand(hostname: string): string {
  return `
    <div class="header__brand">
      <h1 class="header__title">JayQuery</h1>
      <span class="header__sep" aria-hidden="true">·</span>
      <span class="header__hostname mono">${escapeHtml(hostname)}</span>
    </div>
  `;
}

function renderLoading(mode: CheckMode): void {
  root.innerHTML = shellWithFabFooterOnly(`
      <header class="header">
        ${renderHeaderBrand(tabHostname)}
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
        ${tabHostname ? renderHeaderBrand(tabHostname) : '<h1 class="header__title header__title--solo">JayQuery</h1>'}
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
  tenantDirectoryId?: string,
): string {
  const rawBlock = raw
    ? `<details class="raw"><summary>Raw</summary><pre class="raw__pre">${escapeHtml(truncate(raw, 900))}</pre></details>`
    : '';
  const tenantRow = tenantDirectoryId
    ? `<div class="mail-infra-tenant-copy">
      <span class="mono mail-infra-tenant-copy__value">${escapeHtml(tenantDirectoryId)}</span>
      <button type="button" class="mail-infra-copy" data-copy="${escapeHtml(tenantDirectoryId)}" aria-label="Copy tenant ID" title="Copy">
        ${COPY_CLIPBOARD_SVG}
      </button>
    </div>`
    : '';
  const lis = lines.map((t) => `<li>${escapeHtml(t)}</li>`);
  const lineBlock =
    lis.length > 0 ? `<ul class="mail-infra-lines">${lis.join('')}</ul>` : '';
  return `
    <article class="card">
      <div class="card__head">
        <h3 class="card__title">${title}</h3>
        <span class="${badgeClass(status)}">${statusLabel(status)}</span>
      </div>
      <p class="card__detail mail-infra-summary">${escapeHtml(summary)}</p>
      ${tenantRow}
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
  const castShameModal =
    full.dmarc.status === 'fail' ? renderCastShameModal(result) : '';

  root.innerHTML = `
    <div class="shell shell--with-fab">
      <header class="header">
        ${renderHeaderBrand(result.tabHostname)}
        ${modeChips(result.mode)}
        ${tabDiffers ? `<p class="header__hint">Root check uses the registrable domain; switch to <strong>Tab hostname</strong> to score <span class="mono">${escapeHtml(result.tabHostname)}</span>.</p>` : ''}
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
          undefined,
          result.spfMailProviderHint
            ? renderSpfMailProviderHint(result.spfMailProviderHint)
            : undefined,
        )}
        ${renderProtocolCard(
          'DMARC',
          full.dmarc,
          'DMARC record',
          result.dmarcRecords[0] ?? null,
          result.dmarcBreakdown,
          dmarcHint(result),
        )}
        ${renderProtocolCard(
          'DKIM',
          full.dkim,
          `DKIM (${escapeHtml(result.dkim.selector)})`,
          dkimRaw,
          result.dkimBreakdown,
        )}
        ${result.mailInfra
          .map((c) =>
            renderMailInfraCard(
              c.title,
              c.status,
              c.summary,
              c.lines,
              c.raw,
              c.tenantDirectoryId,
            ),
          )
          .join('')}
      </div>

      <footer class="footer">
        <p>DNS queries use DNS-over-HTTPS (Cloudflare / Google). Entra probe uses HTTPS only — no MTA-STS policy files or cert inspection. DKIM uses common selectors only.</p>
        ${renderResultFooterActions(result)}
      </footer>
      ${castShameModal}
    </div>
  `;
  bindModeButtons(result.mode, false);
  bindSettingsFab();
  bindCastShameModal(result);
  bindMailInfraCopyButtons();
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

function bindMailInfraCopyButtons(): void {
  document.querySelectorAll<HTMLButtonElement>('.mail-infra-copy').forEach((btn) => {
    btn.addEventListener('click', () => {
      const text = btn.dataset.copy;
      if (text === undefined || text === '') return;
      void navigator.clipboard.writeText(text).catch(() => {});
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

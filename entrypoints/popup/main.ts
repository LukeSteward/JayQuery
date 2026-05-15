import './style.css';
import {
  resolveCheckTargets,
  runDnsCheck,
  type CheckMode,
  type CheckResult,
} from '@/lib/checkDomain';
import { filterMailInfraLinesWhenCompact } from '@/lib/checks/mailInfra';
import type { SpfMailProviderHint } from '@/lib/checks/mailProviderSpfHint';
import { getActiveTabHostname } from '@/lib/tabHost';
import { buildWallOfShameDmarcIssueUrl } from '@/lib/wallOfShameDmarcIssue';
import {
  filterBreakdownForCompactMode,
  type FullScore,
  type GradeLine,
  type HealthStatus,
} from '@/lib/score';
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type ExtensionSettings,
  type ToolbarIconDriver,
  type DnsProvider,
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
let currentView: 'welcome' | 'main' | 'settings' = 'main';
let lastMode: CheckMode = 'apex';
let lastResult: CheckResult | null = null;
let compareResult: CheckResult | null = null;
let lastResultUpdatesToolbar = true;
let compareRequestId = 0;

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
  if (settings.toolbarIconDriver === 'disabled') {
    await resetToolbarIconForTab(activeTabId);
    return;
  }
  await applyToolbarIconForTab(
    activeTabId,
    result.full,
    settings.toolbarIconDriver,
  );
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

function gradeStatusLabel(status: GradeLine['status']): string {
  if (status === 'info') return 'Info';
  return statusLabel(status);
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

const DNS_TECHNIQUE_DISCLOSURE =
  'DNS queries use DNS-over-HTTPS (Cloudflare / Google). Entra probe uses HTTPS only; no MTA-STS policy files or cert inspection. DKIM probes _domainkey for null DKIM, then configured/provider/common selectors, then *._domainkey.';

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

function hasReportableDmarcIssue(result: CheckResult): boolean {
  return result.full.dmarc.status !== 'pass';
}

function renderResultFooterActions(result: CheckResult): string {
  const rootTargets = resolveCheckTargets(result.tabHostname, 'apex');
  const showCompare = rootTargets.queryHost !== rootTargets.tab;
  const compareBtn = showCompare
    ? `<button type="button" class="footer-action-btn" id="btn-compare-scope">Compare root/tab</button>`
    : '';
  const showCastShame = hasReportableDmarcIssue(result);
  const castShameBtn = showCastShame
    ? `<button type="button" class="footer-action-btn footer-action-btn--shame" id="btn-cast-shame">Report DMARC issue</button>`
    : '';
  return `
    <div class="fab-row fab-row--footer fab-row--split">
      <div class="footer-actions">
        <button type="button" class="footer-action-btn" id="btn-copy-report">Copy report</button>
        ${compareBtn}
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
        <h2 class="cast-shame-modal__title" id="cast-shame-heading">Report DMARC issue</h2>
        <p class="cast-shame-modal__lede">Enter the organisation name for the DMARC submission form.</p>
        <label class="cast-shame-modal__label" for="cast-shame-company">Organisation name</label>
        <input type="text" class="cast-shame-modal__input" id="cast-shame-company" autocomplete="organization" maxlength="160" placeholder="e.g. Acme Ltd" />
        <p class="cast-shame-modal__error" id="cast-shame-error" hidden role="alert">Enter an organisation name.</p>
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
    openUrlInNewTab(
      buildWallOfShameDmarcIssueUrl(
        trimmed,
        result.dmarcLookupHost,
        result.dmarcRecords,
      ),
    );
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

function renderScoreExplanation(full: FullScore): string {
  return `
    <details class="score-explain">
      <summary>Why this score?</summary>
      <div class="score-explain__body">
        <p>The overall score is the sum of the three email-authentication pillars: SPF up to 3 points, DMARC up to 4, and DKIM up to 3.</p>
        <div class="score-explain__rows">
          <div><span>SPF</span><strong>${formatScoreTenth(full.spf.points)} / ${full.spf.max}</strong><em>${escapeHtml(full.spf.detail)}</em></div>
          <div><span>DMARC</span><strong>${formatScoreTenth(full.dmarc.points)} / ${full.dmarc.max}</strong><em>${escapeHtml(full.dmarc.detail)}</em></div>
          <div><span>DKIM</span><strong>${formatScoreTenth(full.dkim.points)} / ${full.dkim.max}</strong><em>${escapeHtml(full.dkim.detail)}</em></div>
        </div>
      </div>
    </details>
  `;
}

function statusSummary(label: string, score: FullScore['spf']): string {
  return `${label}: ${statusLabel(score.status)} (${formatScoreTenth(score.points)}/${score.max}) - ${score.detail}`;
}

function reportLines(result: CheckResult): string[] {
  const lines = [
    `JayQuery report for ${result.queryHostname}`,
    `Checked hostname: ${result.tabHostname}`,
    `DMARC lookup: _dmarc.${result.dmarcLookupHost}`,
    `Mode: ${result.mode === 'apex' ? 'Root domain' : 'Tab hostname'}`,
    `Overall score: ${formatScoreTenth(result.full.overall)}/10`,
    '',
    statusSummary('SPF', result.full.spf),
    statusSummary('DMARC', result.full.dmarc),
    statusSummary('DKIM', result.full.dkim),
  ];

  if (result.dkim.selector) {
    lines.push(`DKIM selector: ${result.dkim.selector}`);
  }

  lines.push('', 'Mail infrastructure:');
  for (const check of result.mailInfra) {
    lines.push(`- ${check.title}: ${statusLabel(check.status)} - ${check.summary}`);
  }

  const findings = [
    ...filterBreakdownForCompactMode(result.spfBreakdown),
    ...filterBreakdownForCompactMode(result.dmarcBreakdown),
    ...filterBreakdownForCompactMode(result.dkimBreakdown),
  ];
  if (findings.length) {
    lines.push('', 'Findings:');
    for (const finding of findings) {
      lines.push(`- ${gradeStatusLabel(finding.status)}: ${finding.text}`);
    }
  }

  return lines;
}

async function copyReport(result: CheckResult, btn: HTMLButtonElement): Promise<void> {
  const originalText = btn.textContent ?? 'Copy report';
  try {
    await navigator.clipboard.writeText(reportLines(result).join('\n'));
    btn.textContent = 'Copied';
  } catch (err) {
    console.error('clipboard: failed to copy report', err);
    btn.textContent = 'Copy failed';
  } finally {
    window.setTimeout(() => {
      btn.textContent = originalText;
    }, 1400);
  }
}

async function loadScopeComparison(
  result: CheckResult,
  btn: HTMLButtonElement,
): Promise<void> {
  const otherMode: CheckMode = result.mode === 'apex' ? 'exact' : 'apex';
  const requestId = ++compareRequestId;
  const originalText = btn.textContent ?? 'Compare root/tab';
  btn.disabled = true;
  btn.textContent = 'Comparing';
  try {
    const nextCompareResult = await runDnsCheck(result.tabHostname, otherMode, {
      treatDnsResolutionErrorsAsFailure:
        settings.treatDnsResolutionErrorsAsFailure,
      dnsProvider: settings.dnsProvider,
      customDkimSelectors: settings.customDkimSelectors,
    });
    if (requestId !== compareRequestId) return;
    compareResult = nextCompareResult;
    renderResult(result);
  } catch (err) {
    if (requestId !== compareRequestId) return;
    console.error('compare: failed to compare root and tab hostname', err);
    btn.textContent = 'Compare failed';
    btn.disabled = false;
    window.setTimeout(() => {
      btn.textContent = originalText;
    }, 1400);
  }
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
      <p class="spf-provider-hint__kicker">MX provider profile (not part of score)</p>
      <div class="spf-provider-hint__head">
        <span class="spf-provider-hint__provider">${escapeHtml(h.providerName)}</span>
        <span class="${badgeClass(h.status)}">${statusLabel(h.status)}</span>
      </div>
      <p class="spf-provider-hint__summary">${escapeHtml(h.summary)}</p>
      ${lineBlock}
    </div>`;
}

function renderFixGuidance(title: 'SPF' | 'DMARC' | 'DKIM', result: CheckResult): string {
  const score = title === 'SPF'
    ? result.full.spf
    : title === 'DMARC'
      ? result.full.dmarc
      : result.full.dkim;
  if (score.status === 'pass') return '';

  const host = title === 'DMARC'
    ? `_dmarc.${result.dmarcLookupHost}`
    : result.queryHostname;
  let guidance = '';
  if (title === 'SPF') {
    const providerInclude = result.spfMailProviderHint?.expectedInclude;
    const example = providerInclude
      ? `v=spf1 include:${providerInclude} -all`
      : 'v=spf1 -all';
    guidance = `Publish one TXT record at ${host}. Example for a domain that sends no mail, or after adding approved senders: ${example}`;
  } else if (title === 'DMARC') {
    guidance = `Publish one TXT record at ${host}. Start with reporting, then move toward enforcement: v=DMARC1; p=none; rua=mailto:dmarc@example.com`;
  } else {
    guidance = 'Confirm the selector your mail platform signs with, then publish that selector under selector._domainkey. Custom selectors can be added in settings.';
  }

  return `
    <details class="fix-guidance">
      <summary>Fix guidance</summary>
      <p>${escapeHtml(guidance)}</p>
    </details>
  `;
}

function renderProtocolCard(
  title: string,
  score: FullScore['spf'],
  rawLabel: string,
  rawSnippet: string | null,
  breakdown: GradeLine[],
  detailedBreakdown: boolean,
  titleInfoTitle?: string,
  supplementalFooter?: string,
): string {
  const breakdownLines = detailedBreakdown
    ? breakdown
    : filterBreakdownForCompactMode(breakdown);
  const rawBlock = rawSnippet
    ? `<details class="raw"><summary>${rawLabel}</summary><pre class="raw__pre">${escapeHtml(truncate(rawSnippet, 900))}</pre></details>`
    : '';
  const titleHtml = titleInfoTitle
    ? (() => {
        const tipId = `card-info-tip-${title
          .replace(/[^a-z0-9]+/gi, '-')
          .toLowerCase()
          .replace(/^-|-$/g, '')}`;
        return `<div class="card__title-group">
        <h3 class="card__title">${title}</h3>
        <span class="card__info-wrap">
          <button type="button" class="card__info" aria-describedby="${tipId}" aria-label="Help: ${escapeHtml(title)} lookup scope">?</button>
          <span id="${tipId}" role="tooltip" class="card__info-tooltip">${escapeHtml(titleInfoTitle)}</span>
        </span>
      </div>`;
      })()
    : `<h3 class="card__title">${title}</h3>`;
  return `
    <article class="card">
      <div class="card__head">
        ${titleHtml}
        <span class="${badgeClass(score.status)}">${statusLabel(score.status)}</span>
      </div>
      <div class="card__points">${formatScoreTenth(score.points)} <span class="card__max">/ ${score.max}</span></div>
      <p class="card__detail">${escapeHtml(score.detail)}</p>
      ${renderGradeBreakdown(breakdownLines)}
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
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/`/g, '&#96;');
}

function modeChips(mode: CheckMode, showExact: boolean): string {
  const exactChip = showExact
    ? `<button type="button" class="chip ${mode === 'exact' ? 'chip--active' : ''}" id="btn-mode-exact" ${mode === 'exact' ? 'aria-current="true"' : ''}>
        Tab hostname
      </button>`
    : '';
  return `
    <div class="mode-row" role="group" aria-label="DNS query scope">
      <button type="button" class="chip ${mode === 'apex' ? 'chip--active' : ''}" id="btn-mode-apex" ${mode === 'apex' ? 'aria-current="true"' : ''}>
        Root domain
      </button>
      ${exactChip}
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

function renderManualLookupForm(hostname: string): string {
  return `
    <form class="manual-lookup" id="manual-lookup-form">
      <label class="manual-lookup__label" for="manual-lookup-domain">Check domain</label>
      <div class="manual-lookup__row">
        <input class="manual-lookup__input" id="manual-lookup-domain" value="${escapeHtml(hostname)}" autocomplete="off" spellcheck="false" />
        <button type="submit" class="manual-lookup__btn">Check</button>
      </div>
    </form>
  `;
}

function renderWelcome(): void {
  const targets = resolveCheckTargets(tabHostname, 'apex');
  const rootHost = targets.queryHost;
  const tabDiffers = rootHost !== targets.tab;
  const tabLine = tabDiffers
    ? `<p class="welcome__text">Use <strong>Tab hostname</strong> only when you want to test the exact subdomain shown in this tab: <span class="mono">${escapeHtml(tabHostname)}</span>.</p>`
    : '';
  const tabButton = tabDiffers
    ? '<button type="button" class="welcome__btn" id="btn-welcome-tab">Check tab hostname</button>'
    : '';

  root.innerHTML = shellWithFabFooterOnly(`
      <header class="header">
        ${renderHeaderBrand(rootHost)}
        ${renderManualLookupForm(rootHost)}
      </header>
      <section class="welcome" aria-labelledby="welcome-title">
        <p class="welcome__kicker">First run</p>
        <h2 class="welcome__title" id="welcome-title">JayQuery starts at the root domain.</h2>
        <p class="welcome__text">Most email security records are set on the main domain, so JayQuery checks <span class="mono">${escapeHtml(rootHost)}</span> by default instead of <code>www</code> or another subdomain.</p>
        ${tabLine}
        <p class="welcome__text">You can switch between scopes later at the top of the results.</p>
        <div class="welcome__actions">
          <button type="button" class="welcome__btn welcome__btn--primary" id="btn-welcome-root">Check root domain</button>
          ${tabButton}
        </div>
      </section>
  `);
  bindWelcomeActions();
  bindManualLookupForm();
  bindSettingsFab();
}

function renderLoading(mode: CheckMode, hostname: string): void {
  const targets = hostname ? resolveCheckTargets(hostname, mode) : null;
  const rootTargets = hostname ? resolveCheckTargets(hostname, 'apex') : null;
  const headerHost = targets?.queryHost ?? '';
  const showExact = rootTargets ? rootTargets.queryHost !== rootTargets.tab : true;
  root.innerHTML = shellWithFabFooterOnly(`
      <header class="header">
        ${headerHost ? renderHeaderBrand(headerHost) : '<h1 class="header__title header__title--solo">JayQuery</h1>'}
        ${renderManualLookupForm(headerHost || hostname)}
        ${modeChips(mode, showExact)}
        <p class="header__hint">${escapeHtml(loadingLabel(mode, hostname))}</p>
      </header>
      <div class="loading">
        <div class="loading__pulse"></div>
        <p>Querying public DNS (DoH)…</p>
      </div>
  `);
  bindModeButtons(mode, true, hostname);
  bindManualLookupForm();
  bindSettingsFab();
}

function renderError(message: string): void {
  void clearToolbarIconIfPossible();
  root.innerHTML = shellWithFabFooterOnly(`
      <header class="header">
        ${tabHostname ? renderHeaderBrand(tabHostname) : '<h1 class="header__title header__title--solo">JayQuery</h1>'}
        ${renderManualLookupForm(tabHostname)}
      </header>
      <div class="panel panel--warn">
        <p class="panel__text">${escapeHtml(message)}</p>
      </div>
  `);
  bindManualLookupForm();
  bindSettingsFab();
}

function renderMailInfraCard(
  title: string,
  status: HealthStatus,
  summary: string,
  lines: string[],
  detailedBreakdown: boolean,
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
  const resolvedLines = detailedBreakdown
    ? lines
    : filterMailInfraLinesWhenCompact(lines);
  const showLines = detailedBreakdown || status !== 'pass';
  const lis = showLines ? resolvedLines.map((t) => `<li>${escapeHtml(t)}</li>`) : [];
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

function renderComparisonValue(label: string, current: FullScore['spf'], other: FullScore['spf']): string {
  const changed = current.status !== other.status || current.points !== other.points;
  return `
    <div class="scope-compare__row ${changed ? 'scope-compare__row--changed' : ''}">
      <span>${label}</span>
      <span>${statusLabel(current.status)} ${formatScoreTenth(current.points)}/${current.max}</span>
      <span>${statusLabel(other.status)} ${formatScoreTenth(other.points)}/${other.max}</span>
    </div>
  `;
}

function renderScopeComparison(current: CheckResult, other: CheckResult | null): string {
  if (!other) return '';
  return `
    <section class="scope-compare" aria-label="Root domain versus tab hostname comparison">
      <div class="scope-compare__head">
        <h2>Root vs tab hostname</h2>
        <span>${current.mode === 'apex' ? 'Current: root' : 'Current: tab'}</span>
      </div>
      <div class="scope-compare__grid scope-compare__grid--head">
        <span>Check</span>
        <span>${escapeHtml(current.queryHostname)}</span>
        <span>${escapeHtml(other.queryHostname)}</span>
      </div>
      <div class="scope-compare__grid">
        ${renderComparisonValue('SPF', current.full.spf, other.full.spf)}
        ${renderComparisonValue('DMARC', current.full.dmarc, other.full.dmarc)}
        ${renderComparisonValue('DKIM', current.full.dkim, other.full.dkim)}
      </div>
    </section>
  `;
}

function dmarcHint(result: CheckResult): string {
  return `DMARC is always read from _dmarc.${result.dmarcLookupHost} (organisational domain of the tab). SPF and DKIM use ${result.queryHostname}.`;
}

function renderResult(result: CheckResult): void {
  const { full } = result;
  const dkimRaw = result.dkim.raw;
  const rootTargets = resolveCheckTargets(result.tabHostname, 'apex');
  const showExact = rootTargets.queryHost !== rootTargets.tab;
  const detailedBreakdown = settings.detailedBreakdown;
  const castShameModal =
    hasReportableDmarcIssue(result) ? renderCastShameModal(result) : '';

  const spfSupplement =
    result.spfMailProviderHint &&
    (detailedBreakdown || result.spfMailProviderHint.status !== 'pass')
      ? renderSpfMailProviderHint(result.spfMailProviderHint)
      : '';
  const spfFooter = `${spfSupplement}${renderFixGuidance('SPF', result)}`;

  root.innerHTML = `
    <div class="shell shell--with-fab">
      <header class="header">
        ${renderHeaderBrand(result.queryHostname)}
        ${renderManualLookupForm(result.queryHostname)}
        ${modeChips(result.mode, showExact)}
      </header>

      <section class="hero">
        ${renderScoreRing(full.overall)}
        <p class="hero__label">SPF + DMARC + DKIM (max 10)</p>
      </section>

      ${renderScoreExplanation(full)}

      ${renderScopeComparison(result, compareResult)}

      <div class="cards">
        ${renderProtocolCard(
          'SPF',
          full.spf,
          'SPF record',
          result.spfRecords[0] ?? null,
          result.spfBreakdown,
          detailedBreakdown,
          undefined,
          spfFooter || undefined,
        )}
        ${renderProtocolCard(
          'DMARC',
          full.dmarc,
          'DMARC record',
          result.dmarcRecords[0] ?? null,
          result.dmarcBreakdown,
          detailedBreakdown,
          dmarcHint(result),
          renderFixGuidance('DMARC', result) || undefined,
        )}
        ${renderProtocolCard(
          'DKIM',
          full.dkim,
          `DKIM (${escapeHtml(result.dkim.selector)})`,
          dkimRaw,
          result.dkimBreakdown,
          detailedBreakdown,
          undefined,
          renderFixGuidance('DKIM', result) || undefined,
        )}
        ${result.mailInfra
          .map((c) =>
            renderMailInfraCard(
              c.title,
              c.status,
              c.summary,
              c.lines,
              detailedBreakdown,
              c.raw,
              c.tenantDirectoryId,
            ),
          )
          .join('')}
      </div>

      <footer class="footer">
        ${renderResultFooterActions(result)}
      </footer>
      ${castShameModal}
    </div>
  `;
  bindModeButtons(result.mode, false, result.tabHostname, lastResultUpdatesToolbar);
  bindManualLookupForm();
  bindSettingsFab();
  bindCastShameModal(result);
  bindCopyReport(result);
  bindScopeCompare(result);
  bindMailInfraCopyButtons();
}

function bindCopyReport(result: CheckResult): void {
  const btn = document.getElementById('btn-copy-report');
  if (!(btn instanceof HTMLButtonElement)) return;
  btn.addEventListener('click', () => void copyReport(result, btn));
}

function bindScopeCompare(result: CheckResult): void {
  const btn = document.getElementById('btn-compare-scope');
  if (!(btn instanceof HTMLButtonElement)) return;
  btn.addEventListener('click', () => void loadScopeComparison(result, btn));
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
            <strong>Detailed breakdown</strong>
            <span class="settings-row__hint">Show all grading bullets when a check passes; when off, only warnings and issues are listed.</span>
          </span>
          <input type="checkbox" id="setting-detailed-breakdown" ${settings.detailedBreakdown ? 'checked' : ''} />
        </label>
        <fieldset class="settings-fieldset">
          <legend class="settings-fieldset__legend">Toolbar icon driver</legend>
          <p class="settings-fieldset__hint">Choose which result drives the coloured pass/fail glyph, rollup all three pillars, or use a neutral grey icon.</p>
          <label class="settings-radio">
            <input type="radio" name="toolbar-icon-driver" value="combined" ${settings.toolbarIconDriver === 'combined' ? 'checked' : ''} />
            <span><strong>Combined</strong>: one icon: green all pass, amber if any warning (still present), red if any fail or missing</span>
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
          <label class="settings-radio">
            <input type="radio" name="toolbar-icon-driver" value="disabled" ${settings.toolbarIconDriver === 'disabled' ? 'checked' : ''} />
            <span><strong>Disabled</strong>: neutral grey icon (no pass/fail glyphs)</span>
          </label>
        </fieldset>

        <details class="settings-advanced">
          <summary class="settings-advanced__summary">Advanced</summary>
          <div class="settings-advanced__inner">
            <label class="settings-text-field">
              <span class="settings-row__text">
                <strong>Custom DKIM selectors</strong>
                <span class="settings-row__hint">Comma or space separated. These are probed before provider and common selectors.</span>
              </span>
              <input type="text" id="setting-custom-dkim-selectors" value="${escapeHtml(settings.customDkimSelectors.join(', '))}" placeholder="e.g. s1 selector1 mail" autocomplete="off" spellcheck="false" />
            </label>
            <label class="settings-row">
              <span class="settings-row__text">
                <strong>Treat DNS resolution errors as failure</strong>
                <span class="settings-row__hint">When off, SERVFAIL and lookup errors are treated like empty TXT (older behaviour).</span>
              </span>
              <input type="checkbox" id="setting-dns-errors-fail" ${settings.treatDnsResolutionErrorsAsFailure ? 'checked' : ''} />
            </label>
            <fieldset class="settings-fieldset settings-fieldset--in-advanced">
              <legend class="settings-fieldset__legend">DNS-over-HTTPS</legend>
              <p class="settings-fieldset__hint">Primary resolver. On fetch failure or an empty OK response JayQuery retries with the alternate public resolver (Google and Cloudflare).</p>
              <label class="settings-radio">
                <input type="radio" name="dns-provider" value="google" ${settings.dnsProvider === 'google' ? 'checked' : ''} />
                <span><strong>Google</strong>: query Google DNS first</span>
              </label>
              <label class="settings-radio">
                <input type="radio" name="dns-provider" value="cloudflare" ${settings.dnsProvider === 'cloudflare' ? 'checked' : ''} />
                <span><strong>Cloudflare</strong>: query Cloudflare DNS first</span>
              </label>
            </fieldset>
            <p class="settings-dns-disclaimer">${escapeHtml(DNS_TECHNIQUE_DISCLOSURE)}</p>
          </div>
        </details>
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

  const dnsFail = document.getElementById(
    'setting-dns-errors-fail',
  ) as HTMLInputElement | null;
  dnsFail?.addEventListener('change', () => {
    void persistSettingsAndRefresh({
      treatDnsResolutionErrorsAsFailure: dnsFail.checked,
    });
  });

  const detailedBreakdownEl = document.getElementById(
    'setting-detailed-breakdown',
  ) as HTMLInputElement | null;
  detailedBreakdownEl?.addEventListener('change', () => {
    void persistSettingsAndRefresh({
      detailedBreakdown: detailedBreakdownEl.checked,
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

  document
    .querySelectorAll<HTMLInputElement>('input[name="dns-provider"]')
    .forEach((el) => {
      el.addEventListener('change', () => {
        if (!el.checked) return;
        void persistSettingsAndRefresh({
          dnsProvider: el.value as DnsProvider,
        });
      });
    });

  const customDkimSelectors = document.getElementById(
    'setting-custom-dkim-selectors',
  ) as HTMLInputElement | null;
  customDkimSelectors?.addEventListener('change', () => {
    void persistSettingsAndRefresh({
      customDkimSelectors: parseSelectorList(customDkimSelectors.value),
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

function parseSelectorList(raw: string): string[] {
  const seen = new Set<string>();
  const selectors: string[] = [];
  for (const part of raw.split(/[\s,]+/)) {
    const selector = part.trim();
    if (!selector || selector.includes('.')) continue;
    const key = selector.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    selectors.push(selector);
  }
  return selectors.slice(0, 20);
}

function hostnameFromManualInput(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const u = new URL(withScheme);
    const host = u.hostname.trim().toLowerCase().replace(/\.+$/, '');
    return host || null;
  } catch {
    return trimmed
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .split('/')[0]
      .split(':')[0]
      .trim()
      .replace(/\.+$/, '') || null;
  }
}

function bindManualLookupForm(): void {
  const form = document.getElementById('manual-lookup-form');
  const input = document.getElementById('manual-lookup-domain');
  if (!(form instanceof HTMLFormElement) || !(input instanceof HTMLInputElement)) {
    return;
  }
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const host = hostnameFromManualInput(input.value);
    if (!host) {
      input.focus();
      return;
    }
    lastResult = null;
    compareResult = null;
    currentView = 'main';
    void runCheck('apex', host, false);
  });
}

async function dismissWelcomeAndRun(mode: CheckMode): Promise<void> {
  settings = { ...settings, firstRunWelcomeSeen: true };
  try {
    await saveSettings(settings);
  } catch (err) {
    console.error('settings: failed to save first-run welcome state', err);
  }
  currentView = 'main';
  await runCheck(mode);
}

function bindWelcomeActions(): void {
  document
    .getElementById('btn-welcome-root')
    ?.addEventListener('click', () => void dismissWelcomeAndRun('apex'));
  document
    .getElementById('btn-welcome-tab')
    ?.addEventListener('click', () => void dismissWelcomeAndRun('exact'));
}

function partialNeedsDnsRefresh(partial: Partial<ExtensionSettings>): boolean {
  return (
    partial.treatDnsResolutionErrorsAsFailure !== undefined ||
    partial.dnsProvider !== undefined ||
    partial.customDkimSelectors !== undefined
  );
}

function partialAffectsToolbarIcon(
  partial: Partial<ExtensionSettings>,
): boolean {
  return partial.toolbarIconDriver !== undefined;
}

async function persistSettingsAndRefresh(
  partial: Partial<ExtensionSettings>,
): Promise<void> {
  settings = { ...settings, ...partial };
  await saveSettings(settings);
  if (!tabHostname) return;

  const dnsRefresh = partialNeedsDnsRefresh(partial);

  if (currentView === 'settings') {
    if (dnsRefresh) {
      try {
        const refreshHost = lastResult?.tabHostname ?? tabHostname;
        const result = await runDnsCheck(refreshHost, lastMode, {
          treatDnsResolutionErrorsAsFailure:
            settings.treatDnsResolutionErrorsAsFailure,
          dnsProvider: settings.dnsProvider,
          customDkimSelectors: settings.customDkimSelectors,
        });
        lastResult = result;
        compareResult = null;
        compareRequestId++;
        if (lastResultUpdatesToolbar) {
          await syncToolbarIconFromResult(result);
        }
      } catch {
        /* keep prior lastResult */
      }
    } else if (lastResult && partialAffectsToolbarIcon(partial)) {
      await syncToolbarIconFromResult(lastResult);
    }
    return;
  }

  if (dnsRefresh) {
    await runCheck(lastMode);
  } else if (lastResult) {
    renderResult(lastResult);
    if (partialAffectsToolbarIcon(partial)) {
      void syncToolbarIconFromResult(lastResult);
    }
  }
}

function bindModeButtons(
  mode: CheckMode,
  loading: boolean,
  hostname: string,
  updateToolbar = true,
): void {
  const apex = document.getElementById('btn-mode-apex');
  const exact = document.getElementById('btn-mode-exact');
  if (loading) {
    apex?.addEventListener('click', () => void runCheck('apex', hostname, updateToolbar));
    exact?.addEventListener('click', () => void runCheck('exact', hostname, updateToolbar));
    return;
  }
  apex?.addEventListener('click', () => {
    if (mode !== 'apex') void runCheck('apex', hostname, updateToolbar);
  });
  exact?.addEventListener('click', () => {
    if (mode !== 'exact') void runCheck('exact', hostname, updateToolbar);
  });
}

async function runCheck(
  mode: CheckMode,
  hostname = tabHostname,
  updateToolbar = true,
): Promise<void> {
  lastMode = mode;
  compareResult = null;
  compareRequestId++;
  lastResultUpdatesToolbar = updateToolbar;
  renderLoading(mode, hostname);
  try {
    const result = await runDnsCheck(hostname, mode, {
      treatDnsResolutionErrorsAsFailure:
        settings.treatDnsResolutionErrorsAsFailure,
      dnsProvider: settings.dnsProvider,
      customDkimSelectors: settings.customDkimSelectors,
    });
    lastResult = result;
    lastResultUpdatesToolbar = updateToolbar;
    if (updateToolbar) {
      await syncToolbarIconFromResult(result);
    }
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
  lastResult = null;
  if (!settings.firstRunWelcomeSeen) {
    currentView = 'welcome';
    renderWelcome();
    return;
  }
  currentView = 'main';
  await runCheck('apex');
}

void main();

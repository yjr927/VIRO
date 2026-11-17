(() => {
  'use strict';
  const REPO = 'yjr927/idore_tools', API = 'https://api.github.com', WORKFLOW = `https://github.com/${REPO}/actions/workflows/pipeline.yml`;
  const KAI = 'reference-assets/kai-full.png';
  const PAGES = { 'create.html': 'production', 'review.html': 'review', 'settings.html': 'settings' };
  const LABELS = { waiting_classification: 'Needs classification', waiting_material: 'Awaiting character', queued: 'Queued', preparing_motion: 'Extracting motion', rendering_clay: 'Rendering clay motion', generating_styles: 'Preparing looks', generating_video: 'Generating video', generating_copy: 'Preparing captions', pending_review: 'Ready for review', approved: 'Approved', uploading: 'Sending to drafts', draft_sent: 'Sent to TikTok drafts', needs_attention: 'Needs attention', rejected: 'Returned to studio' };
  const MATERIALS = { male: 'Male', female: 'Female', mixed: 'Mixed', unknown: 'Material group unconfirmed' }, CASTS = { solo: 'Solo', group: 'Group', unknown: 'Cast unconfirmed' };
  const JOURNAL = 'idore-cloud-dispatch-v1', renderers = new Map(), drafts = new Map();
  const legacyParams = new URLSearchParams(location.search); let removedLegacyGrant = false;
  for (const key of ['code', 'state', 'access_token', 'api_key', 'token', 'error', 'error_description']) if (legacyParams.has(key)) { legacyParams.delete(key); removedLegacyGrant = true; }
  if (removedLegacyGrant) history.replaceState(null, '', location.pathname + (legacyParams.toString() ? '?' + legacyParams.toString() : '') + (location.hash || ''));
  let githubToken = '', credentialGeneration = 0, busy = false, navigating = false, loaded = false, readError = false, pipeline = { items: [], settings: {}, connections: {}, updated_at: '' }, characters = [], selectedId = '', lastReview = '', returnTo = './create.html';
  const $ = selector => document.querySelector(selector);
  const el = (tag, className, text) => { const result = document.createElement(tag); if (className) result.className = className; if (text !== undefined) result.textContent = String(text); return result; };
  const text = (value, maximum = 300) => typeof value === 'string' ? value.trim().slice(0, maximum) : '';
  const safeMessage = value => text(value, 500).replace(/(?:github_pat_|ghp_|sk-(?:or-)?)[A-Za-z0-9_-]{8,}/g, '[credential omitted]');
  const ident = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/.test(value);
  const revision = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
  const date = value => { const time = new Date(value); return value && Number.isFinite(time.getTime()) ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(time) : 'Time not recorded'; };
  function mediaUrl(value, kind = 'video') {
    if (typeof value !== 'string' || value.length > 600) return '';
    const ext = kind === 'image' ? '(?:png|jpg|jpeg|webp)' : 'mp4';
    if (new RegExp(`^(?:generated|reference-assets)/[A-Za-z0-9_-]{1,160}\\.${ext}$`).test(value)) return new URL('./' + value, location.href).href;
    try { const url = new URL(value); return url.protocol === 'https:' && url.host === 'raw.githubusercontent.com' && !url.username && !url.password && !url.search && !url.hash && new RegExp(`^/yjr927/idore_tools/[a-f0-9]{40}/reference-assets/[A-Za-z0-9_-]{1,160}\\.${ext}$`).test(url.pathname) ? url.href : ''; } catch { return ''; }
  }
  function original(value, expected = '') {
    try { const url = new URL(value), match = url.pathname.match(/^\/@[A-Za-z0-9_.-]{1,100}\/video\/(\d{10,25})\/?$/); return url.protocol === 'https:' && ['www.tiktok.com', 'tiktok.com'].includes(url.host) && !url.username && !url.password && match && (!expected || match[1] === expected) ? { url: 'https://www.tiktok.com' + url.pathname.replace(/\/$/, ''), id: match[1] } : null; } catch { return null; }
  }
  function normalizeItem(item) {
    if (!item || !ident(item.id) || !Object.hasOwn(LABELS, item.status)) return null;
    const sourceId = typeof item.source_id === 'string' ? item.source_id.replace(/^tiktok-/, '') : '';
    return { ...item, title: text(item.title, 180) || 'Untitled production', character: text(item.character, 80), source_id: /^\d{10,25}$/.test(sourceId) ? sourceId : '', source_url: original(item.source_url, sourceId)?.url || '', material_group: Object.hasOwn(MATERIALS, item.material_group) ? item.material_group : 'unknown', cast_type: Object.hasOwn(CASTS, item.cast_type) ? item.cast_type : 'unknown', revision: revision(item.revision) ? item.revision : '', message: item.error_code === 'insufficient_quota' ? 'OpenAI credits or the project spending limit blocked captions. Add credits before retrying.' : safeMessage(item.message), video: mediaUrl(item.video_path), poster: mediaUrl(item.poster_path, 'image'), clay: mediaUrl(item.clay_path), image: mediaUrl(item.character_image, 'image') || (item.character === 'KAI' ? KAI : ''), caption: text(item.caption, 6000), captions: Array.isArray(item.captions) ? item.captions.filter(value => typeof value === 'string').slice(0, 5).map(value => text(value, 6000)) : [], hashtags: Array.isArray(item.hashtags) ? item.hashtags.slice(0, 50) : [] };
  }
  function link(label, href, className = '') { const result = el('a', className, label); result.href = href; if (href.startsWith('https:')) { result.target = '_blank'; result.rel = 'noopener noreferrer'; } else if (/\b(?:create|review|settings)\.html/.test(href)) result.dataset.workspace = ''; return result; }
  function button(label, handler, className = 'button') { const result = el('button', className, label); result.type = 'button'; result.addEventListener('click', handler); return result; }
  function notify(message = '', kind = '', settings = false) { const area = $('#workspace-message'); if (!area) return; area.className = 'workspace-message' + (kind ? ' ' + kind : ''); area.replaceChildren(document.createTextNode(message)); if (settings) area.append(document.createTextNode(' '), link('Open connections →', './settings.html')); }
  function badge(item) { return el('span', 'status-badge ' + (['needs_attention', 'rejected'].includes(item.status) ? 'attention' : ['pending_review', 'approved', 'draft_sent'].includes(item.status) ? 'ready' : ''), LABELS[item.status]); }
  function meta(item) { return [item.character || 'Character not matched', MATERIALS[item.material_group], CASTS[item.cast_type]].join(' · '); }
  function empty(title, subtitle, href = '', label = '') { const panel = el('div', 'empty-panel'); panel.append(el('span', 'empty-symbol', '✳'), el('h2', '', title), el('p', '', subtitle)); if (href) panel.append(link(label, href, 'button')); return panel; }
  function consent(label = 'Allow this action to use cloud generation credits.') { const wrap = el('label', 'consent'), input = el('input'); input.type = 'checkbox'; wrap.append(input, el('span', '', label)); return { wrap, input }; }
  function authHint() { const note = el('p', 'subtle'); note.append(document.createTextNode('Before taking action, '), link('connect your workspace →', './settings.html')); return note; }
  function itemLink(item, page = 'review.html') { return `./${page}?item=${encodeURIComponent(item.id)}`; }
  function selectItem(item) { selectedId = item.id; const url = new URL(location.href); url.searchParams.set('item', item.id); history.replaceState(null, '', url.href); renderPage(); }
  function currentItem(items = pipeline.items) { return items.find(item => item.id === selectedId) || items[0] || null; }
  async function publicDocument(path, maximum = 3 * 1024 * 1024) {
    const url = new URL(path, location.href), response = await fetch(url.href, { credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer' });
    if (response.status === 404) return null;
    if (!response.ok || response.url && response.url !== url.href || Number(response.headers.get('Content-Length')) > maximum) throw new Error('unavailable');
    const raw = await response.text(); if (raw.length > maximum) throw new Error('too large'); return JSON.parse(raw);
  }
  async function loadPipeline({ quiet = false, render = true } = {}) {
    try {
      const data = await publicDocument('./data/pipeline.json');
      if (!data) { if (!loaded) pipeline = { items: [], settings: {}, connections: {}, updated_at: '' }; loaded = true; if (!quiet) notify('Production records have not been published yet. Set up services in Connections.', '', true); }
      else { if (data.schema_version !== 1 || !Array.isArray(data.items) || data.items.length > 2000) throw new Error(); pipeline = { ...data, items: data.items.map(normalizeItem).filter(Boolean).sort((a, b) => (new Date(b.created_at).getTime() || 0) - (new Date(a.created_at).getTime() || 0)), settings: data.settings || {}, connections: data.connections || {} }; loaded = true; }
      readError = false; if (render) renderPage(); return pipeline;
    } catch { readError = true; if (!quiet) notify('Could not load cloud progress. Your current view is preserved; refresh shortly.', 'error'); if (render) renderPage(); throw new Error('The latest cloud version could not be verified. Refresh before taking action.'); }
  }
  async function github(path, { method = 'GET', body, token = githubToken } = {}) {
    const prefix = `/repos/${REPO}`, workflow = `${prefix}/actions/workflows/pipeline.yml`;
    if (!(method === 'GET' && [prefix, workflow].includes(path) || method === 'POST' && path === workflow + '/dispatches') || !token) throw new Error('Connect this workspace session first.');
    let response;
    try { response = await fetch(API + path, { method, credentials: 'omit', redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer', headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }); }
    catch { throw Object.assign(new Error(method === 'POST' ? 'The request outcome is uncertain. Check cloud activity before trying again; this site will not resend automatically.' : 'GitHub is temporarily unavailable. Try again shortly.'), { uncertain: method === 'POST' }); }
    if (!response.ok) { const messages = { 401: 'Your workspace credential is invalid or expired. Reconnect to continue.', 403: 'This credential needs Actions read/write and Contents read access to this repository.', 404: 'The repository workflow was not found, or this credential cannot access it.', 422: 'The cloud service cannot accept this action yet. Refresh the records and try again.', 429: 'Too many requests. Try again shortly.' }; throw Object.assign(new Error(messages[response.status] || 'The cloud service did not accept this request. Check task activity.'), { uncertain: method === 'POST' && response.status >= 500 }); }
    if (method === 'POST') { if (response.status !== 204) throw Object.assign(new Error('Receipt could not be confirmed. Check cloud activity before trying again.'), { uncertain: true }); return null; }
    try { const value = await response.json(); if (!value || typeof value !== 'object') throw new Error(); return value; } catch { throw new Error('GitHub returned information that could not be verified. Try again shortly.'); }
  }
  async function fingerprint(value) { const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value))); return Array.from(new Uint8Array(raw), byte => byte.toString(16).padStart(2, '0')).join(''); }
  function readRequests() { const raw = JSON.parse(localStorage.getItem(JOURNAL) || '{}'); if (!raw || Array.isArray(raw) || typeof raw !== 'object') throw new Error(); return raw; }
  async function dispatch(action, item = null, extra = {}) {
    if (busy) return;
    if (!githubToken) { notify('Connect this workspace session before sending a request.', 'error', true); return; }
    if (!['approve', 'reject', 'copy', 'retry', 'sync', 'check'].includes(action)) return;
    const paid = ['copy', 'retry', 'sync'].includes(action);
    if (paid && extra.consent !== true) { notify('Confirm that this action may use cloud generation credits.', 'error'); return; }
    if (item && !revision(item.revision)) { notify('This record has no verifiable version yet. Wait for the cloud to update.', 'error'); return; }
    busy = true; paintSession();
    try {
      await loadPipeline({ quiet: true, render: false });
      const current = item ? pipeline.items.find(row => row.id === item.id) : null;
      if (item && (!current || current.revision !== item.revision)) throw new Error('Cloud content has changed. Refresh and review it again. No request was sent.');
      const caption = action === 'approve' ? text(extra.caption, 2200) : '', hashtags = action === 'approve' ? text(extra.hashtags, 2000) : '';
      if ([caption, hashtags].some(value => value.includes(githubToken) || /(?:github_pat_|ghp_|sk-(?:or-)?)[A-Za-z0-9_-]{12,}/.test(value))) throw new Error('The caption or hashtags contain a credential pattern. Submission was stopped.');
      if (action === 'approve' && (!caption || !hashtags || !hashtags.split(/\s+/).every(tag => /^#[\p{L}\p{N}_]{1,100}$/u.test(tag)))) throw new Error('Add a caption and space-separated hashtags beginning with #.');
      const targetAccount = action === 'approve' && revision(extra.targetAccount) ? extra.targetAccount : '';
      if (action === 'approve') { const liveAccount = pipeline.connections.tiktok || {}; if (liveAccount.configured && (!targetAccount || targetAccount !== liveAccount.account_fingerprint) || !liveAccount.configured && targetAccount) throw new Error('The TikTok account has changed or could not be verified. Refresh and review again. No request was sent.'); }
      const inputs = { action, item_id: item?.id || '', revision: item?.revision || '', caption, hashtags, request_id: '', target_account: targetAccount };
      const key = await fingerprint({ ...inputs, revision: inputs.revision || pipeline.updated_at });
      const submit = async () => {
        let requests; try { requests = readRequests(); } catch { throw new Error('Allow browser storage so this site can record requests and prevent duplicate submissions.'); }
        const prior = requests[key];
        const acknowledgedFailure = prior?.outcome === 'sent' && item && current.status === 'needs_attention' && current.updated_at !== prior.observed_version && Array.isArray(pipeline.requests) && pipeline.requests.includes(prior.request_id);
        if (prior && !acknowledgedFailure) throw new Error(prior.outcome === 'uncertain' ? 'The previous request outcome is uncertain. Duplicate submission was blocked. Check cloud activity.' : 'This request was already received. Wait for the cloud update and refresh. It was not sent again.');
        inputs.request_id = crypto.randomUUID(); requests[key] = { request_id: inputs.request_id, outcome: 'uncertain', at: Date.now(), observed_version: current?.updated_at || '' }; localStorage.setItem(JOURNAL, JSON.stringify(requests));
        try { await github(`/repos/${REPO}/actions/workflows/pipeline.yml/dispatches`, { method: 'POST', body: { ref: 'main', inputs } }); }
        catch (failure) { if (!failure.uncertain) { delete requests[key]; localStorage.setItem(JOURNAL, JSON.stringify(requests)); } throw failure; }
        requests[key].outcome = 'sent';
        try { localStorage.setItem(JOURNAL, JSON.stringify(requests)); } catch { throw new Error('The request was received, but the local record could not update. Check cloud activity before submitting again.'); }
      };
      if (navigator.locks?.request) await navigator.locks.request('idore-cloud-dispatch', { mode: 'exclusive', ifAvailable: true }, async lock => { if (!lock) throw new Error('Another tab is sending a request. Check progress shortly.'); await submit(); });
      else if (paid) throw new Error('This browser cannot safely submit this action. Use the latest Chrome or open the manual cloud workflow in Connections.');
      else await submit();
      notify('Request sent. New results appear after processing and data synchronization.', 'success');
    } catch (failure) { notify(failure.message || 'The request did not complete. Check cloud activity.', 'error'); }
    finally { busy = false; paintSession(); }
  }
  function mediaPanel(item, defaultMode = '') {
    const panel = el('div', 'media-panel'), tabs = el('div', 'media-tabs'), frame = el('div', 'media-frame'), modes = [['original', 'Reference', Boolean(item.source_url)], ['clay', 'Clay motion', Boolean(item.clay)], ['final', 'Final video', Boolean(item.video)]];
    const selected = modes.find(([key, , available]) => key === defaultMode && available)?.[0] || (item.video ? 'final' : item.clay ? 'clay' : 'original');
    function show(mode) {
      for (const video of frame.querySelectorAll('video')) video.pause(); frame.replaceChildren();
      for (const child of tabs.children) { const active = child.dataset.mode === mode; child.classList.toggle('active', active); child.setAttribute('aria-pressed', String(active)); }
      if (mode === 'original') { const source = original(item.source_url, item.source_id); if (source) { const iframe = el('iframe'); iframe.src = `https://www.tiktok.com/player/v1/${source.id}?autoplay=0`; iframe.title = 'TikTok reference preview'; iframe.loading = 'lazy'; iframe.referrerPolicy = 'no-referrer'; iframe.allowFullscreen = true; frame.append(iframe); } else frame.append(el('p', 'media-empty', 'The reference link is not ready yet.')); }
      else { const url = mode === 'clay' ? item.clay : item.video; if (url) { const video = el('video'); video.src = url; video.controls = true; video.playsInline = true; video.preload = 'metadata'; if (mode === 'final' && item.poster) video.poster = item.poster; video.setAttribute('aria-label', mode === 'clay' ? 'Extracted clay motion' : item.title + ' final video'); frame.append(video); } else frame.append(el('p', 'media-empty', mode === 'clay' ? 'Clay motion has not been generated yet.' : 'The final video has not been generated yet.')); }
    }
    for (const [mode, label, available] of modes) { const tab = button(label, () => show(mode), 'media-tab'); tab.dataset.mode = mode; tab.disabled = !available; tabs.append(tab); }
    panel.append(tabs, frame); show(selected); if (item.source_url) panel.append(link('Open reference ↗', item.source_url, 'original-link')); return panel;
  }
  function paintSession() {
    for (const item of document.querySelectorAll('[data-session-label]')) item.textContent = githubToken ? 'Workspace connected' : 'Connect workspace ↗';
    for (const item of document.querySelectorAll('[data-review-count]')) { const count = pipeline.items.filter(row => row.status === 'pending_review').length; item.hidden = !count; item.textContent = String(count); }
    for (const item of document.querySelectorAll('[data-cloud-action]')) item.disabled = busy || item.dataset.actionBlocked === 'true';
    const disconnect = $('#disconnect-workspace'); if (disconnect) disconnect.disabled = busy;
  }
  function tagText(item) { return item.hashtags.map(value => typeof value === 'string' ? value : value?.tag).filter(value => typeof value === 'string').map(value => value.startsWith('#') ? value : '#' + value).join(' '); }
  function citationUrl(value) { if (typeof value !== 'string' || value.length > 2000) return ''; try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && url.hostname.includes('.') && !/^[0-9.]+$/.test(url.hostname) && !/\.(?:localhost|local|internal)$/.test(url.hostname) ? url.href : ''; } catch { return ''; } }
  function getDraft(item) { let draft = drafts.get(item.id); if (!draft || !draft.dirty && draft.revision !== item.revision) { draft = { revision: item.revision, caption: item.caption || item.captions[0] || '', hashtags: tagText(item), dirty: false }; drafts.set(item.id, draft); } return draft; }
  function renderReview() {
    const root = $('#review-root'); if (!root) return;
    const items = pipeline.items.filter(item => item.video || ['pending_review', 'approved', 'uploading', 'draft_sent'].includes(item.status)), item = currentItem(items);
    root.setAttribute('aria-busy', 'false');
    if (!item) { root.replaceChildren(empty('Your review queue is clear.', 'Completed videos and English captions will appear here.', './create.html', 'Open studio →')); return; }
    const draft = getDraft(item), account = pipeline.connections.tiktok || {}, targetAccount = account.configured && revision(account.account_fingerprint) ? account.account_fingerprint : '', signature = JSON.stringify([pipeline.updated_at, item.id, item.revision, Boolean(githubToken), item.status, targetAccount, account.account_label]); if (lastReview === signature && root.children.length) return; lastReview = signature;
    const layout = el('div', 'review-layout'), queue = el('aside', 'review-queue'); queue.append(el('h2', '', 'Review queue'));
    for (const row of items) { const entry = button('', () => { selectedId = row.id; lastReview = ''; selectItem(row); }, 'review-item' + (row.id === item.id ? ' active' : '')); entry.append(el('strong', '', row.title), badge(row), el('small', '', meta(row))); queue.append(entry); }
    const detail = el('section', 'review-detail'), header = el('div', 'review-title'); header.append(el('h2', '', item.title), badge(item)); detail.append(header, el('p', 'meta', meta(item) + ' · ' + date(item.created_at)), mediaPanel(item));
    const edit = el('div', 'review-editor'), caption = el('textarea'), tags = el('textarea'); caption.id = 'review-caption'; caption.rows = 5; caption.maxLength = 2200; caption.value = draft.caption; tags.id = 'review-tags'; tags.rows = 3; tags.maxLength = 2000; tags.value = draft.hashtags;
    const captionLabel = el('label', 'field', 'English caption'); captionLabel.htmlFor = caption.id; const tagsLabel = el('label', 'field', 'Hashtags'); tagsLabel.htmlFor = tags.id; edit.append(captionLabel, caption, tagsLabel, tags, el('p', 'subtle', 'Separate hashtags with spaces. Edits stay in this session and are saved when approved.'));
    for (const input of [caption, tags]) input.addEventListener('input', () => { draft.caption = caption.value; draft.hashtags = tags.value; draft.dirty = true; copy.disabled = !caption.value.trim() && !tags.value.trim(); });
    if (item.captions.length > 1) { const variants = el('details', 'small-details'); variants.append(el('summary', '', 'More caption options')); for (const value of item.captions) variants.append(button(value, () => { caption.value = value; draft.caption = value; draft.dirty = true; }, 'caption-option')); edit.append(variants); }
    const explained = item.hashtags.filter(value => value && typeof value === 'object' && typeof value.reason === 'string');
    if (explained.length) { const reasons = el('details', 'small-details tag-reasons'); reasons.append(el('summary', '', 'Hashtag research')); for (const value of explained.slice(0, 12)) { const row = el('p'); row.append(el('strong', '', text(value.tag, 100)), document.createTextNode(' · ' + text(value.reason, 300))); const url = citationUrl(value.source_url); if (url) row.append(document.createTextNode(' '), link('View source ↗', url, 'text-link')); reasons.append(row); } edit.append(reasons); }
    const copy = button('Copy caption and hashtags', async () => { try { await navigator.clipboard.writeText(caption.value.trim() + '\n\n' + tags.value.trim()); notify('Caption and hashtags copied.', 'success'); } catch { notify('Could not copy. Select the text and copy it manually.', 'error'); } }); copy.disabled = !caption.value.trim() && !tags.value.trim(); edit.append(copy);
    const stale = draft.revision !== item.revision;
    if (stale) { const warn = el('div', 'inline-note warning', 'A newer cloud version is available. Reload it before reviewing.'); warn.append(button('Reload review version', () => { drafts.delete(item.id); lastReview = ''; renderReview(); }, 'text-button')); edit.append(warn); }
    if (!item.revision) edit.append(el('p', 'inline-note warning', 'A verifiable review version is not available yet. Wait for synchronization.'));
    const consentBox = consent('Allow caption and hashtag generation to use OpenAI credits.');
      if (item.video && ['generating_copy', 'needs_attention'].includes(item.status)) { edit.append(consentBox.wrap); const copyAction = button('Generate captions and hashtags', () => dispatch('copy', item, { consent: consentBox.input.checked })); copyAction.dataset.cloudAction = ''; copyAction.dataset.actionBlocked = stale || !item.revision ? 'true' : ''; copyAction.disabled = stale || !item.revision; edit.append(copyAction); }
    if (account.configured) edit.append(el('p', 'approval-target', targetAccount ? 'Publishing account: ' + (text(account.account_label, 80) || 'Connected TikTok account') : 'The TikTok account needs verification. Check Connections first.'));
    const actions = el('div', 'review-actions'), canReview = item.status === 'pending_review' && item.revision && !stale && (!account.configured || targetAccount);
    const approve = button(account.configured ? 'Approve and send to TikTok drafts' : 'Approve video', () => dispatch('approve', item, { caption: caption.value, hashtags: tags.value, targetAccount }), 'button primary'); approve.disabled = !canReview; approve.dataset.revisionBlocked = canReview ? '' : 'true';
    const reject = button('Return to studio', () => dispatch('reject', item), 'button quiet'); reject.disabled = !canReview; actions.append(reject, approve); edit.append(actions);
    if (!githubToken) edit.append(authHint());
    edit.append(el('p', 'subtle', pipeline.connections.tiktok?.configured ? 'After sending a draft, paste the caption in TikTok, finish editing, and confirm publication there.' : 'TikTok is not connected. Approval saves the review result. Final editing and publishing will still happen in TikTok.'));
    if (item.message) edit.append(el('p', 'inline-note', item.message)); detail.append(edit); layout.append(queue, detail); root.replaceChildren(layout);
  }
  function connectionCard(name, description, key) {
    const value = pipeline.connections[key] || {}, panel = el('section', 'service-card'), top = el('div', 'service-top');
    const available = value.configured === true && ['connected', 'ok', 'ready', 'succeeded', 'healthy'].includes(value.status), quota = ['insufficient_quota', 'quota_exceeded', 'quota', 'billing_hard_limit_reached', 'insufficient_credits'].includes(value.status), bad = quota || ['failed', 'error', 'needs_attention'].includes(value.status);
    const unchecked = !value.status || value.status === 'unchecked';
    top.append(el('h2', '', name), el('span', 'status-badge' + (available ? ' ready' : bad ? ' attention' : ''), quota ? 'Credit limit reached' : unchecked ? 'Not checked' : !value.configured ? 'Not configured' : available ? 'Verified' : bad ? 'Needs attention' : 'Saved · not checked')); panel.append(top, el('p', 'service-description', description));
    if (quota) panel.append(el('p', 'inline-note warning', 'Add credits or adjust the provider project limit, then check the connection before retrying captions.'));
    if (typeof value.message === 'string' && value.message.trim()) panel.append(el('p', 'subtle', safeMessage(value.message)));
    if (key === 'tiktok' && value.configured && value.account_label) panel.append(el('p', 'subtle', 'Publishing account: ' + text(value.account_label, 80)));
    if (key !== 'tiktok') panel.append(link(value.configured ? 'Manage cloud credentials ↗' : 'Set up cloud credentials ↗', `https://github.com/${REPO}/settings/secrets/actions`, 'text-link'));
    return panel;
  }
  function renderSettings() {
    const root = $('#settings-root'); if (!root) return; root.setAttribute('aria-busy', 'false');
    const session = el('section', 'settings-panel'), top = el('div', 'section-heading'); top.append(el('h2', '', 'Workspace session'), el('span', 'status-badge' + (githubToken ? ' ready' : ''), githubToken ? 'Connected' : 'Not connected')); session.append(top, el('p', 'subtle', 'Connect to review videos, retry tasks, and check cloud services. Reconnect after refreshing, closing, or leaving the workspace.'));
    if (!githubToken) {
      const form = el('form', 'session-form'), label = el('label', 'field', 'GitHub workspace credential'), input = el('input'); input.id = 'github-workspace-token'; input.type = 'password'; input.autocomplete = 'off'; input.spellcheck = false; input.maxLength = 512; label.htmlFor = input.id; const submit = el('button', 'button primary', 'Connect workspace'); submit.type = 'submit'; form.append(label, input, submit);
      form.addEventListener('submit', async event => { event.preventDefault(); if (busy) return; const token = input.value.trim(), generation = credentialGeneration; input.value = ''; if (!/^github_pat_[A-Za-z0-9_]{20,490}$/.test(token)) { notify('Use a fine-grained GitHub credential for this repository.', 'error'); return; } busy = true; submit.disabled = true;
        try { const repo = await github(`/repos/${REPO}`, { token }); if (repo.full_name !== REPO || repo.permissions?.pull !== true) throw new Error('This credential does not have read access to the repository.'); const workflow = await github(`/repos/${REPO}/actions/workflows/pipeline.yml`, { token }); if (workflow.path !== '.github/workflows/pipeline.yml' || workflow.state !== 'active') throw new Error('The production workflow is not active. Open the manual cloud workflow.'); if (generation !== credentialGeneration) throw new Error('The previous workspace session ended. Reconnect to continue.'); githubToken = token; notify('Workspace connected. No generation request has been sent.', 'success'); renderSettings(); paintSession(); } catch (failure) { githubToken = ''; notify(failure.message || 'Could not connect. Check the credential permissions.', 'error'); } finally { busy = false; submit.disabled = false; paintSession(); }
      }); session.append(form);
      const setup = el('details', 'small-details'); setup.append(el('summary', '', 'Connecting for the first time?'), el('p', '', 'Create a fine-grained token limited to yjr927/idore_tools with Actions read/write and Contents read access. It stays in this tab only and is never written to browser storage.'), link('Create GitHub credential ↗', `https://github.com/settings/personal-access-tokens/new?target_name=yjr927&name=viral-workspace&description=Viral%20cloud%20workspace`, 'text-link')); session.append(setup);
    } else { const row = el('div', 'settings-actions'); row.append(link('Back to studio →', returnTo, 'button primary')); const disconnect = button('Disconnect session', () => { if (busy) return; githubToken = ''; renderSettings(); paintSession(); notify('Workspace disconnected. Cloud services retain their existing configuration.'); }); disconnect.id = 'disconnect-workspace'; row.append(disconnect); session.append(row); }
    const serviceHeading = el('div', 'section-heading settings-section-title'); serviceHeading.append(el('h2', '', 'Cloud services')); const check = button('Check connections', () => dispatch('check')); check.dataset.cloudAction = ''; serviceHeading.append(check);
    const services = el('div', 'service-grid'); services.append(connectionCard('OpenAI', 'Transformation looks, English captions, and hashtags.', 'openai'), connectionCard('OpenRouter', 'Generate videos from character artwork and clay motion.', 'openrouter'));
    const tiktok = connectionCard('TikTok', 'Send reviewed videos to drafts. Finish editing in TikTok.', 'tiktok');
    if (!pipeline.connections.tiktok?.configured) { const disabled = button('Connect TikTok', () => {}); disabled.disabled = true; tiktok.append(disabled); const steps = el('details', 'small-details'); steps.append(el('summary', '', 'What is needed to connect?'), el('p', '', 'Create a TikTok developer app, request video upload access, complete platform review, and authorize the publishing account. Uploads are unavailable until setup is complete.'), link('Read the TikTok setup guide ↗', 'https://developers.tiktok.com/doc/content-posting-api-get-started/', 'text-link')); tiktok.append(steps); }
    services.append(tiktok);
    const keys = el('p', 'subtle'); keys.append(document.createTextNode('OpenAI and OpenRouter keys stay in GitHub Secrets. This website does not read or display them. '), link('Manage cloud credentials ↗', `https://github.com/${REPO}/settings/secrets/actions`, 'text-link'));
    const materials = el('section', 'settings-panel material-section'); materials.append(el('h2', '', 'Character assets')); const enabled = characters.filter(item => item.enabled === true), list = el('div', 'character-list');
    for (const item of enabled) { const row = el('div', 'character-item'), image = mediaUrl(item.image_url, 'image'); if (image) { const img = el('img'); img.src = image; img.alt = text(item.name, 80) + ' character artwork'; img.loading = 'lazy'; row.append(img); } row.append(el('strong', '', text(item.name, 80)), el('span', 'meta', (MATERIALS[item.material_group] || MATERIALS.unknown) + ' · ' + (CASTS[item.cast_type] || CASTS.unknown))); list.append(row); }
    materials.append(list.children.length ? list : el('p', 'subtle', 'The character asset list has not been published yet.'));
    if (pipeline.items.some(item => item.status === 'waiting_material' && item.material_group === 'female') && !enabled.some(item => item.material_group === 'female')) materials.append(el('p', 'inline-note warning', 'Female character assets are needed. Matching references will wait rather than use a male character.'));
    const fallback = el('p', 'subtle settings-fallback'); fallback.append(document.createTextNode('If the workspace cannot connect, use the '), link('manual cloud workflow ↗', WORKFLOW, 'text-link'));
    root.replaceChildren(session, serviceHeading, services, keys, materials, fallback);
  }
  function context() { return { pipeline, characters, el, text, date, link, button, badge, meta, empty, consent, authHint, itemLink, selectItem, currentItem, mediaPanel, dispatch, connected: Boolean(githubToken), busy, notify }; }
  function renderPage() { const page = document.body.dataset.page; if (!loaded && readError && page !== 'settings') { const root = $(page === 'review' ? '#review-root' : '#production-root'); root?.replaceChildren(empty('Cloud records are temporarily unavailable.', 'Refresh shortly. Existing tasks will not be submitted again.')); root?.setAttribute('aria-busy', 'false'); return; } if (page === 'review') renderReview(); else if (page === 'settings') renderSettings(); else renderers.get(page)?.(context()); paintSession(); }
  async function navigate(href, push = true) {
    const url = new URL(href, location.href), name = url.pathname.split('/').pop(); if (url.origin !== location.origin || !PAGES[name] || navigating) return;
    navigating = true;
    try { const response = await fetch(url.href.split('#')[0], { credentials: 'omit', redirect: 'error' }); if (!response.ok) throw new Error(); const raw = await response.text(); if (raw.length > 200000) throw new Error(); const doc = new DOMParser().parseFromString(raw, 'text/html'); if (doc.body.dataset.page !== PAGES[name]) throw new Error(); for (const script of doc.body.querySelectorAll('script')) script.remove(); for (const video of document.querySelectorAll('video')) video.pause(); if (document.body.dataset.page !== 'settings') returnTo = location.pathname + location.search; document.body.replaceWith(document.importNode(doc.body, true)); document.title = doc.title; if (push) history.pushState(null, '', url.href); selectedId = new URLSearchParams(url.search).get('item') || ''; lastReview = ''; renderPage(); window.scrollTo(0, 0); const heading = document.querySelector('h1'); heading?.setAttribute('tabindex', '-1'); heading?.focus({ preventScroll: true }); } catch { notify('This page could not open. Try again shortly.', 'error'); } finally { navigating = false; }
  }
  document.addEventListener('click', event => {
    const anchor = event.target.closest('a[data-workspace]'); if (anchor && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0) { event.preventDefault(); navigate(anchor.href); return; }
    if (event.target.closest('[data-refresh]')) loadPipeline().catch(() => {});
  });
  window.addEventListener('popstate', () => navigate(location.href, false));
  window.addEventListener('pagehide', () => { githubToken = ''; credentialGeneration++; });
  window.addEventListener('pageshow', event => { if (event.persisted) { lastReview = ''; renderPage(); } });
  window.IdoreWorkspace = Object.freeze({ register: (name, renderer) => { renderers.set(name, renderer); if (loaded && document.body.dataset.page === name) renderPage(); }, render: renderPage });
  async function boot() { selectedId = new URLSearchParams(location.search).get('item') || ''; const source = original(new URLSearchParams(location.search).get('reference')); try { await loadPipeline(); if (!selectedId && source) { selectedId = pipeline.items.find(item => item.source_id === source.id)?.id || ''; if (!selectedId && document.body.dataset.page === 'production') notify('This reference is not in the production queue yet. Sync the latest references and check again.'); renderPage(); } } catch { /* An honest unavailable state stays visible. */ } try { const data = await publicDocument('./data/characters.json', 200000); if (data?.schema_version === 1 && Array.isArray(data.items)) characters = data.items.slice(0, 200); if (document.body.dataset.page === 'settings') renderPage(); } catch { /* Materials remain unconfirmed. */ } setInterval(() => { if (!busy && document.visibilityState !== 'hidden') loadPipeline({ quiet: true }).catch(() => {}); }, 30000); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else queueMicrotask(boot);
})();

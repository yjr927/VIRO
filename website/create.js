(() => {
  'use strict';
  let filter = 'all';
  const WORKING = new Set(['queued', 'preparing_motion', 'rendering_clay', 'generating_styles', 'generating_video', 'generating_copy']);
  const WAITING = new Set(['waiting_classification', 'waiting_material', 'needs_attention', 'rejected']);
  const STAGES = ['Reference', 'Motion extraction', 'Clay render', 'Character video', 'English caption'];
  function render(ctx) {
    const root = document.querySelector('#production-root'); if (!root) return;
    root.setAttribute('aria-busy', 'false');
    const { pipeline, el, button, link, badge, meta, empty } = ctx;
    const limit = pipeline.settings.daily_limit;
    document.querySelector('#production-rule').textContent = Number.isInteger(limit) && limit > 0 ? `Up to ${limit} references / day · 2 K-pop + 2 virtual idols` : 'US / English · rules awaiting sync';
    const groups = { all: pipeline.items, working: pipeline.items.filter(item => WORKING.has(item.status)), review: pipeline.items.filter(item => item.status === 'pending_review'), attention: pipeline.items.filter(item => WAITING.has(item.status)) };
    const summary = el('div', 'production-summary');
    for (const [key, label] of [['all', 'All tasks'], ['working', 'In production'], ['review', 'To review'], ['attention', 'Needs attention']]) {
      const control = button('', () => { filter = key; window.IdoreWorkspace.render(); }, 'summary-card' + (filter === key ? ' active' : '')); control.setAttribute('aria-pressed', String(filter === key)); control.append(el('strong', '', groups[key].length), el('span', '', label)); summary.append(control);
    }
    const operations = el('div', 'production-actions'), syncConsent = ctx.consent('Allow syncing to continue production within the daily limit using cloud credits.'), sync = button('Sync and continue', () => ctx.dispatch('sync', null, { consent: syncConsent.input.checked })); sync.dataset.cloudAction = ''; operations.append(syncConsent.wrap, sync);
    if (!pipeline.items.length) { root.replaceChildren(summary, operations, empty('Your studio is ready.', 'Sync references to add eligible videos to cloud production.', './', 'Discover references →')); return; }
    const items = groups[filter], selected = ctx.currentItem(items);
    if (!selected) { root.replaceChildren(summary, operations, empty('No tasks in this view.', 'Choose All tasks to view your saved production records.')); return; }
    const layout = el('div', 'production-layout'), list = el('div', 'production-list');
    for (const item of items) {
      const row = button('', () => ctx.selectItem(item), 'production-item' + (item.id === selected.id ? ' active' : '')); row.setAttribute('aria-pressed', String(item.id === selected.id));
      if (item.image) { const image = el('img', 'production-thumb'); image.src = item.image; image.alt = item.character || ' character artwork'; image.loading = 'lazy'; row.append(image); } else row.append(el('span', 'production-thumb placeholder', '✳'));
      const body = el('div', 'production-item-body'); body.append(el('h3', '', item.title), el('p', 'meta', meta(item)), badge(item)); row.append(body, el('span', 'production-chevron', '›')); list.append(row);
    }
    const detail = el('section', 'production-detail'), heading = el('div', 'detail-heading'), title = el('div'); title.append(el('h2', '', selected.title), el('p', 'meta', meta(selected))); heading.append(title, badge(selected)); detail.append(heading, ctx.mediaPanel(selected));
    const statusStep = { queued: 0, preparing_motion: 1, rendering_clay: 2, generating_video: 3, generating_copy: 4, pending_review: 5, approved: 5, uploading: 5, draft_sent: 5 };
    let index = statusStep[selected.status];
    if (index === undefined && selected.status === 'needs_attention') index = statusStep[selected.stage] ?? (selected.video ? 4 : selected.clay ? 3 : -1);
    if (index === undefined) index = -1;
    const steps = el('ol', 'production-steps'); steps.setAttribute('aria-label', 'Production stages from reference to character video');
    STAGES.forEach((stage, step) => { const row = el('li', 'production-step' + (step < index ? ' done' : step === index ? ' active' : '')); row.append(el('span', '', step < index ? '✓' : step + 1), document.createTextNode(stage)); if (step === index) row.setAttribute('aria-current', 'step'); steps.append(row); }); detail.append(steps);
    if (selected.status === 'waiting_classification') detail.append(el('p', 'material-hold', 'Confirm the reference material group, cast, and transformation before character generation starts.'));
    if (selected.status === 'waiting_material') detail.append(el('p', 'material-hold', selected.material_group === 'female' ? 'Waiting for female character assets. Male characters will not be substituted.' : 'Waiting for matching character artwork before continuing.'));
    if (selected.message) detail.append(el('p', 'inline-note' + (selected.status === 'needs_attention' ? ' warning' : ''), selected.message));
    const actions = el('div', 'detail-actions');
    if (selected.video) actions.append(link('Review final video →', ctx.itemLink(selected), 'button primary'));
    if (['waiting_material', 'waiting_classification'].includes(selected.status)) actions.append(link('Connections and assets →', './settings.html', 'button'));
    if (['needs_attention', 'rejected'].includes(selected.status) || selected.video && selected.status === 'generating_copy') {
      const paid = ctx.consent('Allow this retry or caption generation to use cloud credits.'); detail.append(paid.wrap);
      if (selected.video) { const copy = button('Generate captions and hashtags', () => ctx.dispatch('copy', selected, { consent: paid.input.checked })); copy.dataset.cloudAction = ''; copy.dataset.actionBlocked = selected.revision ? '' : 'true'; copy.disabled = !selected.revision; actions.append(copy); }
      if (['needs_attention', 'rejected'].includes(selected.status)) { const retry = button('Retry this step', () => ctx.dispatch('retry', selected, { consent: paid.input.checked })); retry.dataset.cloudAction = ''; retry.dataset.actionBlocked = selected.revision ? '' : 'true'; retry.disabled = !selected.revision; actions.append(retry); }
    }
    if (actions.children.length) detail.append(actions);
    if (!ctx.connected) detail.append(ctx.authHint());
    layout.append(list, detail); root.replaceChildren(summary, operations, layout);
  }
  window.IdoreWorkspace.register('production', render);
})();

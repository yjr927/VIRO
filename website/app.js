'use strict';

const $ = selector => document.querySelector(selector);
const statuses = {
  not_run: ['Waiting for the first collection', 'Not started'],
  running: ['Collecting references', 'In progress'],
  succeeded: ['Collection complete', 'References saved'],
  partial: ['Some sources returned references', 'Partial results'],
  empty: ['No references returned', 'No results'],
  blocked: ['TikTok is temporarily unavailable', 'Access restricted'],
  failed: ['Collection incomplete', 'Collection failed'],
  interrupted: ['Collection interrupted', 'Interrupted']
};
const kindLabels = { hands: 'Dance & gestures', transition: 'Style transitions', pov: 'Expression & POV' };
const topicLabels = { kpop: 'K-pop', virtual_idol: 'Virtual idols', unknown: 'Topic unconfirmed' };
const materialLabels = { male: 'Male character', female: 'Female character', mixed: 'Mixed characters', unknown: 'Material unconfirmed' };
const castLabels = { solo: 'Solo', group: 'Group', unknown: 'Cast unconfirmed' };
const transformationLabels = { makeup: 'Makeup', outfit: 'Outfit', makeup_and_outfit: 'Makeup & outfit', none: 'No style change', unknown: 'Style change unconfirmed' };
const favoriteKey = 'idore-tiktok-discovery-favorites-v1';
let data = { videos: [], runs: [] };
let category = 'all';
let topic = 'all';
let material = 'all';
let cast = 'all';
let search = '';
let onlyFavorites = false;
let historyDate = '';
let toastTimer;
let favorites = new Set();
try {
  const stored = JSON.parse(localStorage.getItem(favoriteKey) || '[]');
  if (Array.isArray(stored)) favorites = new Set(stored.filter(value => typeof value === 'string'));
} catch { /* Favorites remain available for this visit if storage is unavailable. */ }

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = String(content);
  return node;
}
const collectionTimeZone = 'America/New_York';
const collectionDateFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: collectionTimeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});
function dateParts(value) {
  if (!value) return null;
  const time = new Date(value);
  if (!Number.isFinite(time.getTime())) return null;
  return Object.fromEntries(collectionDateFormat.formatToParts(time).map(part => [part.type, part.value]));
}
function collectionDay(value) {
  const parts = dateParts(value);
  return parts ? `${parts.year}-${parts.month}-${parts.day}` : '';
}
function formatDate(value) {
  const parts = dateParts(value);
  return parts ? `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}` : '—';
}
function captureMoment(video) {
  return dateParts(video.first_seen_at) ? video.first_seen_at : video.last_seen_at;
}
function topicOf(video) { return Object.hasOwn(topicLabels, video.trend_category) ? video.trend_category : 'unknown'; }
function axisObservation(video, axis) {
  const observations = (Array.isArray(video.observations) ? video.observations : []).filter(item => item && typeof item === 'object' && Number.isFinite(new Date(item.observed_at).getTime()) && (axis === 'material' ? Object.hasOwn(item, 'material_group') : item.checks && Object.hasOwn(item.checks, 'solo'))).sort((a, b) => new Date(b.observed_at) - new Date(a.observed_at));
  const observation = observations[0];
  const source = observation || video;
  const watched = observation ? observation.original_watched === true : workObservation(video);
  const value = axis === 'material' ? (watched && Object.hasOwn(materialLabels, source.material_group) ? source.material_group : 'unknown') : (watched && source.checks?.solo === true ? 'solo' : watched && source.checks?.solo === false ? 'group' : 'unknown');
  return { value, at: observation ? new Date(observation.observed_at).getTime() : null };
}
function materialOf(video) {
  const fact = axisObservation(video, 'material');
  const reviewed = video.material_classification?.material_group;
  const newerCapture = fact.value !== 'unknown' && fact.at !== null && fact.at > new Date(video.material_classification?.observed_at).getTime();
  if (Object.hasOwn(materialLabels, reviewed) && !newerCapture) return reviewed === 'unknown' || video.material_classification.original_watched === true ? reviewed : 'unknown';
  return fact.value;
}
function castOf(video) {
  const fact = axisObservation(video, 'cast');
  const reviewed = video.material_classification?.subject_group;
  const newerCapture = fact.value !== 'unknown' && fact.at !== null && fact.at > new Date(video.material_classification?.observed_at).getTime();
  if (Object.hasOwn(castLabels, reviewed) && !newerCapture) return reviewed === 'unknown' || video.material_classification.original_watched === true ? reviewed : 'unknown';
  return fact.value;
}
function transformationOf(video) { return Object.hasOwn(transformationLabels, video.transformation) ? video.transformation : 'unknown'; }
function generationRoute(video) {
  const transformation = transformationOf(video);
  if (['makeup', 'outfit', 'makeup_and_outfit'].includes(transformation)) return 'Prepare before-and-after looks for the same character, then generate a transition video.';
  if (transformation === 'none' && video.kind === 'hands') return 'Character image + motion reference → dance or gesture video.';
  if (transformation === 'none') return 'Character image + source motion breakdown → prepare a generation plan.';
  return 'Confirm any makeup or outfit changes before choosing a generation route.';
}
function classification(video) {
  const tags = el('div', 'classification-tags');
  tags.append(el('span', 'topic-tag', topicLabels[topicOf(video)]), el('span', 'material-tag', materialLabels[materialOf(video)]), el('span', 'cast-tag', castLabels[castOf(video)]), el('span', '', kindLabels[video.kind] || 'Motion unconfirmed'), el('span', '', transformationLabels[transformationOf(video)]));
  return tags;
}
function runMoment(run) { return run.observed_at || run.started_at || run.finished_at; }
function orderedRuns(runs) {
  return (Array.isArray(runs) ? runs : []).filter(run => run && typeof run === 'object').sort((a, b) => {
    const time = run => { const value = new Date(runMoment(run)).getTime(); return Number.isFinite(value) ? value : -Infinity; };
    return time(b) - time(a);
  }).slice(0, 90);
}
function metric(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return '—';
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}
function videoUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !['www.tiktok.com', 'tiktok.com'].includes(url.hostname) || url.username || url.password || (url.port && url.port !== '443')) return null;
    const match = url.pathname.match(/^\/@([a-zA-Z0-9_.-]{1,100})\/video\/(\d{10,25})\/?$/);
    if (!match) return null;
    return { url: `https://www.tiktok.com/@${match[1]}/video/${match[2]}`, author: match[1], videoId: match[2] };
  } catch { return null; }
}
function sourceUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !['www.tiktok.com', 'tiktok.com'].includes(url.hostname) || url.username || url.password || (url.port && url.port !== '443')) return null;
    return url.href;
  } catch { return null; }
}
function externalLink(label, url, className) {
  const link = el('a', className, label);
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  return link;
}
function toast(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 4000);
}
function candidateId(video) { return videoUrl(video.url)?.videoId || video.id; }
function toggleFavorite(video) {
  const id = candidateId(video);
  if (favorites.has(id)) favorites.delete(id); else favorites.add(id);
  try { localStorage.setItem(favoriteKey, JSON.stringify([...favorites])); } catch { toast('Saved for this visit. Your browser is not allowing local storage.'); }
  renderVideos();
}
function openPreview(video) {
  const canonical = videoUrl(video.url);
  if (!canonical) return;
  $('#preview-title').textContent = `Original reference · @${canonical.author}`;
  $('#preview-original').href = canonical.url;
  const frame = el('iframe');
  frame.src = `https://www.tiktok.com/player/v1/${canonical.videoId}`;
  frame.title = `TikTok original: ${video.title || canonical.author}`;
  frame.allow = 'fullscreen';
  frame.referrerPolicy = 'no-referrer';
  $('#preview-container').replaceChildren(frame);
  $('#preview-dialog').showModal();
}
function workObservation(video) {
  return video.source_kind === 'chatgpt_work' && video.original_watched === true;
}
function observationCheck(label, value, watched) {
  const state = watched && typeof value === 'boolean' ? value : null;
  return el('span', state === true ? 'check-confirmed' : state === false ? 'check-unmatched' : '',
    `${label} · ${state === true ? 'Confirmed' : state === false ? 'Not matched' : 'Unverified'}`);
}
function relatedExamples(video) {
  const examples = Array.isArray(video.related_videos) ? video.related_videos : [];
  const valid = examples.filter(item => item && videoUrl(item.url));
  if (!valid.length) return null;
  const details = el('details', 'related-examples');
  details.append(el('summary', '', `Related references · ${valid.length}`));
  for (const item of valid.slice(0, 8)) {
    const canonical = videoUrl(item.url);
    const row = el('div', 'related-example');
    row.append(externalLink(`@${canonical.author} · Open original ↗`, canonical.url));
    const watched = video.source_kind === 'chatgpt_work' && item.original_watched === true;
    const comparable = workObservation(video) && watched;
    const consistency = comparable && item.same_pattern === true ? 'Same pattern observed' : comparable && item.same_pattern === false ? 'Different pattern observed' : 'Pattern consistency unverified';
    row.append(el('p', '', `${watched ? 'Original watched' : 'Original not watched'} · ${consistency}`));
    if (typeof item.note === 'string' && item.note.trim()) row.append(el('p', '', item.note));
    details.append(row);
  }
  return details;
}
function historySnapshot(video, run) {
  const canonical = videoUrl(video.url);
  const snapshot = el('article', 'history-video');
  const heading = el('div', 'history-video-heading');
  heading.append(el('h4', '', video.title || `Reference by @${canonical.author}`));
  heading.append(externalLink('Open original ↗', canonical.url));
  snapshot.append(heading, el('p', 'history-video-meta', `@${canonical.author} · ${kindLabels[video.kind] || 'Motion unconfirmed'} · ${workObservation(video) ? 'Watched by Work' : 'Original unverified'}`));
  snapshot.append(classification(video), el('p', 'history-video-meta', `Recorded material: ${materialLabels[materialOf(video)]}`));
  snapshot.append(el('p', 'history-motion', video.motion_summary || 'No motion description was saved for this collection. Cast, repetition and recreation difficulty cannot be inferred.'));
  const checks = el('div', 'checks');
  checks.append(observationCheck('Solo', video.checks?.solo, workObservation(video)), observationCheck('Repeating motion', video.checks?.repetitive, workObservation(video)), observationCheck('Fixed camera', video.checks?.fixed_camera, workObservation(video)), el('span', '', 'AI recreation · Not tested'));
  snapshot.append(checks);
  const observed = video.observed_at || runMoment(run);
  const values = [['views', 'Views'], ['likes', 'Likes'], ['comments', 'Comments'], ['shares', 'Shares']].map(([key, label]) => `${label} ${metric(video.metrics?.[key])}`).join(' · ');
  snapshot.append(el('p', 'history-video-meta', `Recorded page metrics: ${values}. Observed ${formatDate(observed)} (New York). Unavailable values are shown as —.`));
  const published = video.published_at ? formatDate(video.published_at) : video.published_text ? `${video.published_text} (as displayed then)` : 'Unverified';
  snapshot.append(el('p', 'history-video-meta', `Original published: ${published}`));
  if (typeof video.recreation_notes === 'string' && video.recreation_notes.trim()) snapshot.append(el('p', 'history-motion', `Recreation suggestion (not tested): ${video.recreation_notes}`));
  const related = relatedExamples(video);
  if (related) snapshot.append(related);
  const source = sourceUrl(video.source_url);
  const label = `Source: ${video.source || (video.source_kind === 'chatgpt_work' ? 'ChatGPT Work observations' : 'TikTok public page')}`;
  snapshot.append(source ? externalLink(`${label} ↗`, source, 'history-video-source') : el('p', 'history-video-meta', label));
  return snapshot;
}
function historyRun(run) {
  const row = el('details', 'history-run');
  const summary = el('summary');
  const date = el('time', 'history-run-time', formatDate(runMoment(run)));
  if (typeof runMoment(run) === 'string') date.dateTime = runMoment(run);
  const status = Object.hasOwn(statuses, run.status) ? run.status : 'unknown';
  const counts = value => Number.isInteger(value) && value >= 0 ? value : '—';
  summary.append(date,
    el('span', `state-pill state-${status}`, statuses[status]?.[1] || 'Status not recorded'),
    el('span', 'history-run-counts', `${counts(run.found)} observed · ${counts(run.added)} added`),
    el('span', 'history-run-source', run.collector === 'chatgpt_work' || run.source_kind === 'chatgpt_work' ? 'ChatGPT Work' : 'Public page collection'));
  row.append(summary);
  const body = el('div', 'history-run-body');
  if (typeof run.message === 'string' && run.message.trim()) body.append(el('p', 'history-run-message', run.message));
  const snapshots = Array.isArray(run.video_snapshots) ? run.video_snapshots.filter(video => video && videoUrl(video.url)).slice(0, 8) : [];
  if (snapshots.length) {
    body.append(el('p', 'history-evidence-note', `This collection saved ${snapshots.length} reference snapshots. Metrics reflect the page at the time; AI recreation suggestions have not been tested.`));
    body.append(...snapshots.map(video => historySnapshot(video, run)));
  } else {
    const note = Array.isArray(run.video_snapshots) ? 'No reference snapshots were saved in this collection. Failed or empty results are kept as recorded.' : 'This older collection has no video snapshots. Only the sources saved at the time are available.';
    body.append(el('p', 'history-evidence-note', note));
    const sources = Array.isArray(run.sources) ? run.sources : [];
    for (const source of sources) {
      if (!source || typeof source !== 'object') continue;
      const sourceRow = el('p', 'history-source-row');
      const link = sourceUrl(source.url);
      sourceRow.append(link ? externalLink(`${source.name || 'TikTok source'} ↗`, link) : el('span', '', source.name || 'Source not recorded'));
      if (link) sourceRow.append(el('span', '', ` · ${link}`));
      else if (typeof source.url === 'string' && source.url.trim()) sourceRow.append(el('span', '', ` · Source URL (unverified): ${source.url.slice(0, 500)}`));
      if (typeof source.message === 'string' && source.message.trim()) sourceRow.append(el('span', '', ` · ${source.message}`));
      body.append(sourceRow);
    }
    if (!sources.length) body.append(el('p', 'history-video-meta', 'No source URL was attached to this record.'));
  }
  row.append(body);
  return row;
}
function renderHistory() {
  const saved = orderedRuns(data.runs);
  const filtered = saved.filter(run => !historyDate || collectionDay(runMoment(run)) === historyDate);
  $('#history-count').textContent = `${saved.length} saved${historyDate ? ` · ${filtered.length} on this date` : ''}`;
  const list = $('#history-list');
  if (!filtered.length) {
    const empty = el('div', 'history-empty');
    empty.append(el('p', '', historyDate ? 'No saved collections for this date in New York.' : 'No collections have been received yet. Saved collection history will appear after the source data is updated.'));
    list.replaceChildren(empty);
    return;
  }
  const groups = [];
  let day = null;
  let section;
  for (const run of filtered) {
    const nextDay = collectionDay(runMoment(run)) || 'Date not recorded';
    if (nextDay !== day) {
      day = nextDay;
      section = el('section', 'history-day');
      section.append(el('h3', '', day));
      groups.push(section);
    }
    section.append(historyRun(run));
  }
  list.replaceChildren(...groups);
}
function videoCard(video) {
  const canonical = videoUrl(video.url);
  const watched = workObservation(video);
  const card = el('article', 'video-card');
  const top = el('div', 'card-top');
  top.append(el('span', `candidate-pill${watched ? ' watched-pill' : ''}`, watched ? 'Original watched' : 'Awaiting review'));
  const saved = favorites.has(candidateId(video));
  const favorite = el('button', `favorite-button${saved ? ' selected' : ''}`, saved ? '★' : '☆');
  favorite.type = 'button';
  favorite.setAttribute('aria-label', `${saved ? 'Unsave' : 'Save'} ${video.title || canonical.author}`);
  favorite.setAttribute('aria-pressed', String(saved));
  favorite.title = saved ? 'Saved reference' : 'Save reference';
  favorite.addEventListener('click', () => toggleFavorite(video));
  top.append(favorite);
  card.append(top);

  const visual = el('div', `card-visual visual-${Object.hasOwn(kindLabels, video.kind) ? video.kind : 'other'}`);
  const visualTitle = el('span', 'visual-title', kindLabels[video.kind] || 'Reference');
  visualTitle.setAttribute('aria-hidden', 'true');
  const play = el('button', 'play-button', '↗');
  play.type = 'button';
  play.setAttribute('aria-label', `Watch reference: ${video.title || canonical.author}`);
  play.addEventListener('click', () => openPreview(video));
  visual.append(el('span', 'video-platform', 'TikTok reference'), visualTitle, play, el('span', 'video-preview-note', 'Open original reference'));
  card.append(visual);

  const body = el('div', 'card-body');
  body.append(el('p', 'card-author', `@${canonical.author}`), el('h3', '', video.title || 'TikTok reference'));
  const tags = el('div', 'classification-tags compact-tags');
  if (topicOf(video) !== 'unknown') tags.append(el('span', 'topic-tag', topicLabels[topicOf(video)]));
  tags.append(el('span', 'material-tag', materialLabels[materialOf(video)]), el('span', 'cast-tag', castLabels[castOf(video)]));
  body.append(tags);

  const metrics = el('div', 'metrics');
  for (const [key, label] of [['views', 'Views'], ['likes', 'Likes'], ['comments', 'Comments']]) {
    const cell = el('div'); cell.append(el('strong', '', metric(video.metrics?.[key])), el('span', '', label)); metrics.append(cell);
  }
  body.append(metrics);

  const evidence = el('details', 'card-evidence');
  evidence.append(el('summary', '', 'Reference details'));
  evidence.append(classification(video));
  if (video.material_classification && typeof video.material_classification === 'object') {
    const reviewed = video.material_classification;
    const note = el('div', 'classification-review');
    note.append(el('strong', '', `Classification review · ${formatDate(reviewed.observed_at)} (New York)`));
    if (typeof reviewed.note === 'string' && reviewed.note.trim()) note.append(el('p', '', reviewed.note));
    if (typeof reviewed.source === 'string' && reviewed.source.trim()) note.append(el('small', '', reviewed.source));
    evidence.append(note);
  }
  const route = el('div', 'generation-route');
  route.append(el('strong', '', 'Prepare to create'), el('p', '', generationRoute(video)), el('small', '', 'Connect your workspace and confirm the source material before generating.'));
  evidence.append(route);
  if (!watched || video.assessment_note !== video.motion_summary) evidence.append(el('p', 'assessment', video.assessment_note || (watched ? 'Work saved an observation of the original. This does not verify current popularity or a successful AI recreation.' : 'Public reference saved. Cast, repeating motion and pattern consistency still need to be checked against the original.')));
  if (typeof video.motion_summary === 'string' && video.motion_summary.trim()) {
    const summary = el('div', 'observation-notes');
    summary.append(el('strong', '', watched ? 'Observed motion' : 'Motion notes · Original unverified'), el('p', '', video.motion_summary));
    evidence.append(summary);
  }
  const checks = el('div', 'checks');
  checks.append(
    observationCheck('Solo', video.checks?.solo, watched),
    observationCheck('Repeating motion', video.checks?.repetitive, watched),
    observationCheck('Fixed camera', video.checks?.fixed_camera, watched),
    el('span', watched && video.trend_verified === true ? 'check-confirmed' : '', watched && video.trend_verified === true ? 'Pattern supported by original observations' : 'Pattern unverified'),
    el('span', '', 'AI recreation · Not tested')
  );
  evidence.append(checks);
  if (watched && video.trend_verified === true) evidence.append(el('p', 'assessment', 'Related originals support the same pattern. Current popularity or growth has not been verified.'));
  if (typeof video.recreation_notes === 'string' && video.recreation_notes.trim()) {
    const notes = el('div', 'observation-notes');
    notes.append(el('strong', '', 'Recreation suggestion · Not tested'), el('p', '', video.recreation_notes));
    evidence.append(notes);
  }
  const related = relatedExamples(video);
  if (related) evidence.append(related);
  const details = el('div', 'card-details');
  const source = sourceUrl(video.source_url);
  const sourceLabel = video.source || (video.source_kind === 'chatgpt_work' ? 'ChatGPT Work · TikTok observations' : 'TikTok public page');
  details.append(source ? externalLink(`Source: ${sourceLabel} ↗`, source) : el('span', '', `Source: ${sourceLabel}`));
  details.append(el('span', '', `First found ${formatDate(video.first_seen_at)} · Last observed ${formatDate(video.last_seen_at)} (New York)`));
  details.append(el('span', '', `Original published ${video.published_at ? formatDate(video.published_at) : video.published_text || 'Unverified'}${!video.published_at && video.published_text ? ' (as displayed then)' : ''}`));
  details.append(externalLink('Open on TikTok ↗', canonical.url));
  evidence.append(details);
  body.append(evidence);

  const actions = el('div', 'card-actions');
  const preview = el('button', 'button primary small', 'Watch reference');
  preview.type = 'button'; preview.addEventListener('click', () => openPreview(video));
  const replicate = el('a', 'button small', 'Use reference ↗');
  const createParams = new URLSearchParams({ reference: canonical.url, material: materialOf(video), cast: castOf(video) });
  replicate.href = `./create.html?${createParams}`;
  replicate.title = 'Open the studio with this reference';
  actions.append(preview, replicate);
  body.append(actions); card.append(body);
  return card;
}
function renderVideos() {
  const valid = data.videos.filter(video => video && videoUrl(video.url));
  const base = valid.filter(video => (topic === 'all' || topicOf(video) === topic) && (category === 'all' || video.kind === category || (Array.isArray(video.kinds) && video.kinds.includes(category))) && (!onlyFavorites || favorites.has(candidateId(video))) && `${video.title || ''} ${video.author || ''} ${video.kind || ''} ${topicLabels[topicOf(video)]} ${materialLabels[materialOf(video)]} ${castLabels[castOf(video)]} ${transformationLabels[transformationOf(video)]} ${video.motion_summary || ''} ${video.recreation_notes || ''}`.toLowerCase().includes(search.toLowerCase()));
  document.querySelectorAll('[data-material]').forEach(button => {
    const key = button.dataset.material;
    const count = base.filter(video => (cast === 'all' || castOf(video) === cast) && (key === 'all' || materialOf(video) === key)).length;
    button.textContent = `${key === 'all' ? 'All materials' : materialLabels[key]} · ${count}`;
  });
  document.querySelectorAll('[data-cast]').forEach(button => {
    const key = button.dataset.cast;
    const count = base.filter(video => (material === 'all' || materialOf(video) === material) && (key === 'all' || castOf(video) === key)).length;
    button.textContent = `${key === 'all' ? 'All casts' : castLabels[key]} · ${count}`;
  });
  const list = base.filter(video => (material === 'all' || materialOf(video) === material) && (cast === 'all' || castOf(video) === cast)).sort((a, b) => {
    const time = video => { const value = new Date(captureMoment(video)).getTime(); return Number.isFinite(value) ? value : -Infinity; };
    return time(b) - time(a) || String(candidateId(a)).localeCompare(String(candidateId(b)));
  });
  $('#nav-count').textContent = String(valid.length);
  $('#result-count').textContent = `${list.length} reference${list.length === 1 ? '' : 's'}`;
  const grid = $('#video-grid');
  grid.classList.add('video-grid');
  for (const [selector, value] of [['#stat-references', valid.length], ['#stat-watched', valid.filter(workObservation).length], ['#stat-runs', orderedRuns(data.runs).length]]) {
    const node = $(selector); if (node) node.textContent = String(value).padStart(2, '0');
  }
  const latestCollection = $('#latest-collection');
  if (latestCollection) latestCollection.textContent = data.last_success_at ? formatDate(data.last_success_at) + ' (New York)' : 'No collection yet';
  if (list.length) { grid.replaceChildren(...list.map(videoCard)); return; }

  const empty = el('div', 'empty-state');
  empty.append(el('span', 'empty-icon', onlyFavorites ? '☆' : '⌕'));
  empty.append(el('h3', '', onlyFavorites ? 'No saved references yet' : valid.length ? 'No references match your filters' : 'Waiting for the first references'));
  empty.append(el('p', '', onlyFavorites ? 'Save references you like to return to them later. Saves stay in this browser.' : valid.length ? 'Try a different topic, character group, cast, motion or search term. Older references without complete observations remain in the unconfirmed filters.' : 'No references have been returned. Collection history shows the recorded status, without sample videos.'));
  grid.replaceChildren(empty);
}
function renderStatus() {
  const runs = orderedRuns(data.runs);
  const latest = runs[0];
  const fromWork = data.collector === 'chatgpt_work' || latest?.source_kind === 'chatgpt_work' || latest?.collector === 'chatgpt_work';
  const state = latest?.status || data.status || 'not_run';
  const [title, pill] = statuses[state] || ['Collection status unconfirmed', 'Unknown status'];
  $('#status-heading').textContent = fromWork ? ({ succeeded: 'Work saved new references', partial: 'Work saved partial results', empty: 'Work submitted no references', failed: 'Work collection incomplete', blocked: 'Work access restricted', not_run: 'Waiting for Work results', running: 'Recording Work results', interrupted: 'Work collection interrupted' }[state] || 'Work status unconfirmed') : title;
  $('#status-pill').textContent = fromWork && ['succeeded', 'partial'].includes(state) ? 'Work record' : pill;
  $('#status-pill').className = `state-pill state-${Object.hasOwn(statuses, state) ? state : 'unknown'}`;
  const defaults = {
    not_run: 'No collection records have been published. Run the collection workflow in GitHub Actions first.',
    blocked: 'TikTok did not return a readable video list. A login or verification may be needed. This does not mean there are no new trends.',
    empty: 'No references were returned in this collection. Existing data is retained; this does not establish that there are no new trends.'
  };
  $('#status-message').textContent = latest?.message || (fromWork ? 'Published observations from Work are shown here. Refreshing reads saved results; it does not start a collection or enable a daily task.' : defaults[state] || 'References come from public pages. Playback and motion content still need verification.');
  $('#last-attempt-label').textContent = fromWork ? 'Last Work attempt' : 'Last attempt';
  $('#last-success-label').textContent = fromWork ? 'Last Work result' : 'Last result';
  $('#last-attempt').textContent = formatDate(data.last_attempt_at || latest?.started_at);
  const successful = runs.find(run => ['succeeded', 'partial'].includes(run.status) && (run.found > 0 || run.added > 0));
  $('#last-success').textContent = formatDate(data.last_success_at || successful?.finished_at);
  const report = $('#source-report');
  const sources = Array.isArray(latest?.sources) ? latest.sources : [];
  if (!sources.length) report.replaceChildren(el('p', '', fromWork ? 'See each reference for its original source and observation notes.' : 'No public-page collection records yet.'));
  else report.replaceChildren(...sources.map(source => {
    const row = el('p', 'source-row');
    const link = sourceUrl(source.url);
    row.append(link ? externalLink(`${source.name || 'TikTok public page'} ↗`, link) : el('span', '', source.name || 'TikTok public page'));
    row.append(el('span', '', ` · ${source.status === 'ok' ? `${Number.isInteger(source.found) ? source.found : '—'} references recorded` : source.message || 'Temporarily unavailable'}`));
    return row;
  }));
}
async function loadData() {
  const button = $('#refresh-button'); button.disabled = true; button.textContent = 'Refreshing…';
  try {
    const response = await fetch(`./data/discovery.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const next = await response.json();
    if (!next || !Array.isArray(next.videos) || !Array.isArray(next.runs)) throw new Error('Invalid data schema');
    data = next; renderStatus(); renderVideos(); renderHistory();
  } catch {
    $('#status-heading').textContent = 'Published results are unavailable';
    $('#status-pill').textContent = 'Read failed';
    $('#status-pill').className = 'state-pill state-failed';
    $('#status-message').textContent = 'Try refreshing later. The website could not read its data; this does not establish that collection failed. Existing results remain available.';
    renderVideos(); renderHistory();
  } finally { button.disabled = false; button.replaceChildren(el('span', '', '↻'), document.createTextNode('Refresh references')); }
}

$('#refresh-button').addEventListener('click', loadData);
$('#favorites-filter').addEventListener('change', event => { onlyFavorites = event.target.checked; renderVideos(); });
$('#search-input').addEventListener('input', event => { search = event.target.value.trim(); renderVideos(); });
$('#history-date-filter').addEventListener('change', event => { historyDate = event.target.value; renderHistory(); });
$('#history-clear-filter').addEventListener('click', () => { historyDate = ''; $('#history-date-filter').value = ''; renderHistory(); });
document.querySelectorAll('[data-category]').forEach(button => button.addEventListener('click', () => {
  category = button.dataset.category;
  document.querySelectorAll('[data-category]').forEach(tab => { const active = tab.dataset.category === category; tab.classList.toggle('active', active); tab.setAttribute('aria-pressed', String(active)); });
  renderVideos();
}));
document.querySelectorAll('[data-topic]').forEach(button => button.addEventListener('click', () => {
  topic = button.dataset.topic;
  document.querySelectorAll('[data-topic]').forEach(tab => { const active = tab.dataset.topic === topic; tab.classList.toggle('active', active); tab.setAttribute('aria-pressed', String(active)); });
  renderVideos();
}));
document.querySelectorAll('[data-material]').forEach(button => button.addEventListener('click', () => {
  material = button.dataset.material;
  document.querySelectorAll('[data-material]').forEach(tab => { const active = tab.dataset.material === material; tab.classList.toggle('active', active); tab.setAttribute('aria-pressed', String(active)); });
  renderVideos();
}));
document.querySelectorAll('[data-cast]').forEach(button => button.addEventListener('click', () => {
  cast = button.dataset.cast;
  document.querySelectorAll('[data-cast]').forEach(tab => { const active = tab.dataset.cast === cast; tab.classList.toggle('active', active); tab.setAttribute('aria-pressed', String(active)); });
  renderVideos();
}));
$('#close-preview').addEventListener('click', () => $('#preview-dialog').close());
$('#preview-dialog').addEventListener('close', () => $('#preview-container').replaceChildren());
$('#preview-dialog').addEventListener('click', event => {
  if (event.target !== $('#preview-dialog')) return;
  const bounds = event.target.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) event.target.close();
});
loadData();

/* Yes, Chef! — offline cooking companion */
(() => {
'use strict';
const D = window.YC_DATA;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cap = s => String(s).replace(/(^|[\s(-])([a-zà-ÿ])/g, (m, a, b) => a + b.toUpperCase());
const LS = {
  get(k, d) { try { const v = localStorage.getItem('yc_' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('yc_' + k, JSON.stringify(v)); } catch (e) { toast('⚠️ Storage full — export a backup'); } }
};

/* ================= STATE ================= */
const st = {
  pantry: new Set(LS.get('pantry', [])),
  tools: new Set(LS.get('tools', [])),
  favs: new Set(LS.get('favs', [])),
  log: LS.get('log', {}),
  custom: LS.get('custom', []),
  myIng: LS.get('myIng', []),
  myTools: LS.get('myTools', []),
  set: Object.assign({ vol: 'us', wt: 'us', temp: 'F', sound: true, staples: true, mMiss: 1, mTools: false, mSel: [] }, LS.get('settings', {}))
};
const save = {
  pantry: () => LS.set('pantry', [...st.pantry]),
  tools: () => LS.set('tools', [...st.tools]),
  favs: () => LS.set('favs', [...st.favs]),
  log: () => LS.set('log', st.log),
  custom: () => LS.set('custom', st.custom),
  myIng: () => LS.set('myIng', st.myIng),
  myTools: () => LS.set('myTools', st.myTools),
  set: () => LS.set('settings', st.set)
};
const UI = { tab: 'recipes', q: '', cat: 'All', diff: 'Any', cui: 'All', canMake: false, sort: 'az', pq: '', pf: 'all', kq: '' };

const allRecipes = () => D.recipes.concat(st.custom);
const getRecipe = id => allRecipes().find(r => r.id === id);
const allPantry = () => D.pantry.concat(st.myIng.map(x => ({ n: x.n, c: 'My Ingredients', mine: 1 })));
const allTools = () => D.tools.concat(st.myTools.map(x => ({ n: x.n, g: x.g || 'My Tools', mine: 1 })));
const pkey = n => { n = String(n).toLowerCase().trim(); return D.aliases[n] || n; };
const isStaple = n => st.set.staples && D.staples.includes(pkey(n));
const isOpt = i => /optional/i.test(i.note || '');
const reqIng = r => r.ing.filter(i => !isOpt(i));
const haveIng = (i, set = st.pantry) => isStaple(i.n) || set.has(pkey(i.n));
function ingScore(r, set = st.pantry) {
  const req = reqIng(r); const miss = req.filter(i => !haveIng(i, set));
  return { total: req.length, have: req.length - miss.length, miss: miss.map(i => i.n) };
}
const missTools = r => r.tools.filter(t => !st.tools.has(t));
const canMake = r => ingScore(r).miss.length === 0 && missTools(r).length === 0;

/* ================= SOUND ================= */
const Snd = (() => {
  let ctx = null, noiseBuf = null;
  const init = () => {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    ctx = new AC();
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  };
  document.addEventListener('pointerdown', () => { init(); if (ctx && ctx.state === 'suspended') ctx.resume(); }, { passive: true });
  const ok = () => st.set.sound && init();
  function noise(dur, type, freq, vol, q = 1) {
    const t = ctx.currentTime, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; f.type = type; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(ctx.destination); s.start(t); s.stop(t + dur + .05); return g;
  }
  function tone(f1, f2, dur, vol, type = 'sine', delay = 0) {
    const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f1, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + .01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + dur + .05);
  }
  const safe = o => { for (const k in o) { const f = o[k]; o[k] = (...a) => { try { f(...a); } catch (e) { } }; } return o; };
  return safe({
    chop() { if (!ok()) return; noise(.05, 'highpass', 2500, .18); tone(180, 90, .06, .08, 'triangle'); },
    bubble() { if (!ok()) return; tone(320, 900, .12, .09); tone(500, 1300, .09, .05, 'sine', .07); },
    sizzle() {
      if (!ok()) return; const t = ctx.currentTime; const g = noise(.9, 'bandpass', 5200, .07, .7);
      for (let i = 0; i < 14; i++) g.gain.setValueAtTime(.02 + Math.random() * .07, t + i * .055);
      g.gain.exponentialRampToValueAtTime(0.0001, t + .9);
    },
    whoosh() { if (!ok()) return; const t = ctx.currentTime, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = noiseBuf; f.type = 'bandpass'; f.Q.value = 1.2; f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(2400, t + .22);
      g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.05, t + .08); g.gain.exponentialRampToValueAtTime(.0001, t + .25);
      s.connect(f); f.connect(g); g.connect(ctx.destination); s.start(t); s.stop(t + .3); },
    ding() { if (!ok()) return; tone(1318, 0, 1.2, .14); tone(1976, 0, 1.0, .07, 'sine', .02); },
    alarm() { if (!ok()) return; for (let i = 0; i < 3; i++) { tone(1568, 0, .35, .16, 'sine', i * .45); tone(2093, 0, .3, .08, 'sine', i * .45 + .02); } }
  });
})();

/* ================= UNITS ================= */
const VOL = { tsp: 4.92892, tbsp: 14.7868, cup: 236.588, floz: 29.5735, ml: 1, l: 1000, pint: 473.176, quart: 946.353 };
const WT = { oz: 28.3495, lb: 453.592, g: 1, kg: 1000 };
const PLURAL = { clove: 'cloves', slice: 'slices', can: 'cans', pkg: 'pkgs', bunch: 'bunches', sprig: 'sprigs', stick: 'sticks', pinch: 'pinches', dash: 'dashes', bag: 'bags', head: 'heads', jar: 'jars', loaf: 'loaves', rack: 'racks', scoop: 'scoops', box: 'boxes' };
const FR = [[0, ''], [1/8, '⅛'], [1/4, '¼'], [1/3, '⅓'], [3/8, '⅜'], [1/2, '½'], [5/8, '⅝'], [2/3, '⅔'], [3/4, '¾'], [7/8, '⅞'], [1, '']];
function frac(x, allowThirds = true) {
  if (x <= 0) return '0';
  let w = Math.floor(x), f = x - w, best = FR[0], bd = 9;
  for (const c of FR) { if (!allowThirds && (c[0] === 1/3 || c[0] === 2/3)) continue; const d = Math.abs(c[0] - f); if (d < bd) { bd = d; best = c; } }
  if (best[0] === 1) { w += 1; best = FR[0]; }
  if (w === 0 && !best[1]) return x < 0.1 ? 'a pinch of' : '⅛';
  return (w ? w : '') + best[1];
}
const num = (x, dp = 1) => { const p = Math.pow(10, dp); return String(Math.round(x * p) / p); };
function fmtQ(q, u) {
  if (q == null) return { q: '', u: '' };
  if (VOL[u]) {
    const ml = q * VOL[u], m = st.set.vol;
    if (m === 'metric') return ml >= 1000 ? { q: num(ml / 1000, 2), u: 'L' } : { q: ml < 10 ? String(Math.max(.5, Math.round(ml * 2) / 2)) : ml < 100 ? String(Math.round(ml)) : String(Math.round(ml / 5) * 5), u: 'ml' };
    if (m === 'floz') { if (ml < VOL.tbsp * .99) return { q: frac(ml / VOL.tsp, false), u: 'tsp' }; const fo = ml / VOL.floz; return { q: fo < 4 ? frac(fo, false) : num(Math.round(fo * 2) / 2), u: 'fl oz' }; }
    if (ml < VOL.tbsp * .99) return { q: frac(ml / VOL.tsp, false), u: 'tsp' };
    if (ml < VOL.cup / 4 * .98) return { q: frac(ml / VOL.tbsp, false), u: 'tbsp' };
    const c = ml / VOL.cup; return { q: frac(c), u: c > 1.05 ? 'cups' : 'cup' };
  }
  if (WT[u]) {
    const g = q * WT[u];
    if (st.set.wt === 'metric') return g >= 1000 ? { q: num(g / 1000, 2), u: 'kg' } : { q: String(g < 100 ? Math.round(g) : Math.round(g / 5) * 5), u: 'g' };
    if (g < WT.lb * .97) { const oz = g / WT.oz; return { q: oz < 4 ? frac(oz, false) : num(Math.round(oz * 2) / 2), u: 'oz' }; }
    const lb = g / WT.lb; return { q: frac(lb, false), u: 'lb' };
  }
  const s = frac(q);
  if (!u) return { q: s, u: '' };
  return { q: s, u: q > 1.01 && PLURAL[u] ? PLURAL[u] : u };
}
function nameFor(i, q) {
  let n = i.n;
  if (q != null && q <= 1.01 && !i.u) n = n.replace(/ies$/, 'y').replace(/(oes)$/, 'o').replace(/([^s])s$/, '$1');
  return n;
}
function ingLine(i, f) {
  const q = i.q == null ? null : i.q * f; const o = fmtQ(q, i.u);
  let qs = o.q; if (qs === 'a pinch of') { o.u = ''; }
  return { q: (qs + (o.u ? ' ' + o.u : '')).trim(), n: nameFor(i, q), note: i.note || '', tt: i.q == null };
}
function convTemps(s) {
  if (st.set.temp !== 'C') return s;
  return s.replace(/(\d{2,3})°F/g, (m, f) => { const c = (f - 32) * 5 / 9; return (f >= 250 ? Math.round(c / 5) * 5 : Math.round(c)) + '°C'; });
}
const fmtTime = m => m < 60 ? m + ' min' : Math.floor(m / 60) + ' hr' + (m % 60 ? ' ' + (m % 60) + ' min' : '');
const flames = d => { const n = d === 'Easy' ? 1 : d === 'Medium' ? 2 : 3; return `<span class="dm l${n}" title="${d}"><i></i><i></i><i></i></span>`; };

/* ================= TOAST / MODAL ================= */
let toastT;
function toast(msg, act, fn) {
  const t = $('#toast'); t.innerHTML = esc(msg) + (act ? ` <button id="toastAct">${esc(act)}</button>` : ''); t.classList.toggle('act', !!act); t.classList.add('show');
  if (act) $('#toastAct').onclick = () => { t.classList.remove('show'); fn(); };
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), act ? 4500 : 1900);
}
function modal(html) { $('#modalBox').innerHTML = html; $('#modal').classList.add('open'); }
function closeModal() { $('#modal').classList.remove('open'); }
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal' || e.target.closest('[data-mclose]')) closeModal(); });

/* ================= NAV ================= */
const main = $('#main');
function go(tab) {
  UI.tab = tab; $$('#nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  render(); main.scrollTop = 0;
}
$('#nav').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { Snd.whoosh(); go(b.dataset.tab); } });
function render() { ({ recipes: vRecipes, match: vMatch, pantry: vPantry, kitchen: vKitchen, favs: vFavs })[UI.tab](); }

/* ================= NUTRITION & RATINGS ================= */
const nutCache = new Map();
function nutOf(r) { const key = r.id + ':' + (r.mine ? JSON.stringify(r.ing).length + ':' + r.serves : ''); if (!nutCache.has(key)) nutCache.set(key, ycNutrition(D, r)); return nutCache.get(key); }
const logOf = id => st.log[id] || [];
function ratingOf(id) { const l = logOf(id).filter(e => e.stars); return l.length ? l.reduce((a, e) => a + e.stars, 0) / l.length : 0; }
const starStr = (v, cls = '') => `<span class="stars ${cls}">${[1, 2, 3, 4, 5].map(k => `<i class="${v >= k - .25 ? 'on' : v >= k - .75 ? 'half' : ''}">★</i>`).join('')}</span>`;
/* ================= PICTURES ================= */
const picSrc = r => r.photo || (r.img ? 'img/' + r.img + '.webp' : '');
function pic(r, big) {
  const src = picSrc(r);
  if (!src) return `<div class="${big ? 'bigplate' : 'plate'}"><span class="emo">${esc(r.emoji || '🍽️')}</span></div>`;
  return `<div class="${big ? 'bigplate' : 'plate'} photo${r.photo ? ' own' : ''}"><img src="${esc(src)}" alt="" loading="lazy" decoding="async" draggable="false"></div>`;
}
/* ================= CARDS ================= */
function card(r, i) {
  const sc = st.pantry.size ? ingScore(r) : null;
  const pct = sc ? Math.round(sc.have / Math.max(1, sc.total) * 100) : 0;
  return `<div class="card wood ${i < 24 ? 'pop' : ''}" data-open="${r.id}" style="--d:${Math.min(i, 24) * 25}ms">
    ${r.mine ? '<span class="badge">MINE</span>' : (r.tags || []).includes('family-recipe') ? '<span class="badge fam">FAMILY</span>' : ''}
    <button class="fav ${st.favs.has(r.id) ? 'on' : ''}" data-fav="${r.id}">♥</button>
    <div style="--b:${(i % 7) * .4}s">${pic(r)}</div>
    <div class="cname">${esc(r.name)}</div>
    <div class="cmeta">⏱ ${fmtTime(r.mins)} · ${flames(r.diff)} · ${Math.round(nutOf(r).cal)} cal</div>
    ${logOf(r.id).length ? `<div class="cmeta crate">${ratingOf(r.id) ? starStr(ratingOf(r.id)) : ''} <b>Cooked ${logOf(r.id).length}×</b></div>` : ''}
    ${sc ? `<div class="mbar"><i style="width:${pct}%"></i></div><div class="mtxt">${sc.have}/${sc.total} in pantry</div>` : ''}
  </div>`;
}
main.addEventListener('click', e => {
  const f = e.target.closest('[data-fav]');
  if (f) { e.stopPropagation(); toggleFav(f.dataset.fav, f); return; }
  const o = e.target.closest('[data-open]');
  if (o) openRecipe(o.dataset.open);
});
function toggleFav(id, el) {
  if (st.favs.has(id)) { st.favs.delete(id); toast('💔 Removed from favorites'); Snd.chop(); }
  else { st.favs.add(id); toast('❤️ Added to favorites'); Snd.bubble(); }
  save.favs(); if (el) el.classList.toggle('on', st.favs.has(id));
  if (UI.tab === 'favs') render();
}

/* ================= RECIPES VIEW ================= */
const CATS = ['All', 'Breakfast', 'Lunch', 'Dinner', 'Snack', 'Dessert'];
const CAT_EMO = { All: '🍽️', Breakfast: '🍳', Lunch: '🥪', Dinner: '🍲', Snack: '🧀', Dessert: '🍰' };
function filtered() {
  const q = UI.q.trim().toLowerCase();
  let list = allRecipes().filter(r =>
    (UI.cat === 'All' || r.cat === UI.cat) && (UI.diff === 'Any' || r.diff === UI.diff) && (UI.cui === 'All' || r.cui === UI.cui) &&
    (!q || r.name.toLowerCase().includes(q) || r.cui.toLowerCase().includes(q) || (r.tags || []).some(t => t.includes(q)) || r.ing.some(i => i.n.includes(q))) &&
    (!UI.canMake || canMake(r)));
  if (UI.sort === 'az') list.sort((a, b) => a.name.localeCompare(b.name));
  else if (UI.sort === 'time') list.sort((a, b) => a.mins - b.mins);
  else if (UI.sort === 'match') list.sort((a, b) => { const x = ingScore(a), y = ingScore(b); return (y.have / y.total) - (x.have / x.total) || x.miss.length - y.miss.length; });
  else if (UI.sort === 'rated') list.sort((a, b) => ratingOf(b.id) - ratingOf(a.id) || logOf(b.id).length - logOf(a.id).length);
  else if (UI.sort === 'protein') list.sort((a, b) => nutOf(b).p - nutOf(a).p);
  else if (UI.sort === 'lowcal') list.sort((a, b) => nutOf(a).cal - nutOf(b).cal);
  else if (UI.sort === 'diff') { const o = { Easy: 0, Medium: 1, Difficult: 2 }; list.sort((a, b) => o[a.diff] - o[b.diff]); }
  return list;
}
function vRecipes() {
  const cuis = ['All', ...[...new Set(allRecipes().map(r => r.cui))].sort()];
  main.innerHTML = `<div class="view">
    <div class="search"><input id="q" type="search" placeholder="Search recipes, ingredients, cuisines…" value="${esc(UI.q)}" autocomplete="off"><button class="hbtn" id="rand" aria-label="Random"><span class="dice">🎲</span></button></div>
    <div class="chips" id="cats">${CATS.map(c => `<button class="chip ${UI.cat === c ? 'on' : ''}" data-c="${c}">${CAT_EMO[c]} ${c === 'Snack' ? 'Snacks' : c === 'Dessert' ? 'Desserts' : c}</button>`).join('')}</div>
    <div class="row">
      <div class="seg" id="diffs">${['Any', 'Easy', 'Medium', 'Difficult'].map(d => `<button class="${UI.diff === d ? 'on' : ''}" data-d="${d}">${d}</button>`).join('')}</div>
    </div>
    <div class="row"><button class="tog ${UI.canMake ? 'on' : ''}" id="canTog"><span class="sw"></span>Only show what I can make (pantry + kitchen)</button></div>
    <div class="row" style="flex-wrap:nowrap">
      <select class="sel" id="cui" style="flex:1;min-width:0">${cuis.map(c => `<option value="${c}" ${UI.cui === c ? 'selected' : ''}>${c === 'All' ? '🌎 All cuisines' : c}</option>`).join('')}</select>
      <select class="sel" id="sort" style="flex:1;min-width:0">
        <option value="az" ${UI.sort === 'az' ? 'selected' : ''}>A → Z</option><option value="time" ${UI.sort === 'time' ? 'selected' : ''}>Quickest</option>
        <option value="diff" ${UI.sort === 'diff' ? 'selected' : ''}>Easiest</option><option value="match" ${UI.sort === 'match' ? 'selected' : ''}>Best pantry match</option>
        <option value="rated" ${UI.sort === 'rated' ? 'selected' : ''}>My top rated</option><option value="protein" ${UI.sort === 'protein' ? 'selected' : ''}>Most protein</option><option value="lowcal" ${UI.sort === 'lowcal' ? 'selected' : ''}>Fewest calories</option></select>
    </div>
    <div id="rlist"></div></div>`;
  drawList();
  const qi = $('#q'); qi.addEventListener('input', () => { UI.q = qi.value; drawList(); });
  $('#cats').onclick = e => { const b = e.target.closest('[data-c]'); if (b) { UI.cat = b.dataset.c; Snd.chop(); $$('#cats .chip').forEach(x => x.classList.toggle('on', x === b)); drawList(); } };
  $('#diffs').onclick = e => { const b = e.target.closest('[data-d]'); if (b) { UI.diff = b.dataset.d; Snd.chop(); $$('#diffs button').forEach(x => x.classList.toggle('on', x === b)); drawList(); } };
  $('#canTog').onclick = e => {
    UI.canMake = !UI.canMake; e.currentTarget.classList.toggle('on', UI.canMake); Snd.chop();
    if (UI.canMake && (!st.pantry.size || !st.tools.size)) toast('Tip: stock your Pantry & Kitchen first 👨‍🍳');
    drawList();
  };
  $('#cui').onchange = e => { UI.cui = e.target.value; drawList(); };
  $('#sort').onchange = e => { UI.sort = e.target.value; drawList(); };
  $('#rand').onclick = e => {
    const list = filtered(); if (!list.length) return toast('No recipes match your filters');
    const d = $('.dice', e.currentTarget); d.classList.remove('spin'); void d.offsetWidth; d.classList.add('spin'); Snd.bubble();
    setTimeout(() => openRecipe(list[Math.floor(Math.random() * list.length)].id), 650);
  };
}
function drawList() {
  const list = filtered(), el = $('#rlist');
  el.innerHTML = `<div class="count">${list.length} recipe${list.length === 1 ? '' : 's'}</div>` +
    (list.length ? `<div class="grid">${list.map(card).join('')}</div>` :
      `<div class="empty"><span class="big">🧑‍🍳</span>${UI.canMake ? 'Nothing you can fully make yet.<br>Add more to your Pantry and Kitchen, or try “What Can I Make” for near-matches.' : 'No recipes found. Try a different search.'}</div>`);
}

/* ================= RECIPE DETAIL ================= */
let cur = null;
function openSheet(id) { const s = $('#' + id); s.classList.add('open'); }
function closeSheet(id) { $('#' + id).classList.remove('open'); }
$$('.sheet [data-close]').forEach(b => b.onclick = () => { Snd.whoosh(); closeSheet(b.closest('.sheet').id); if (b.closest('#detail')) cur = null; });
function openRecipe(id) {
  const r = getRecipe(id); if (!r) return;
  cur = { id, serves: r.serves, ck: new Set(), done: new Set() };
  drawDetail(true); openSheet('detail'); $('#dBody').scrollTop = 0; Snd.sizzle();
}
function timerChips(text, idx) {
  const re = /(\d+(?: \d\/\d)?|\d\/\d)(?:\s*[–-]\s*(\d+(?: \d\/\d)?))?\s*(hours?|hrs?|minutes?|mins?|seconds?)\b/gi; let m, out = [];
  while ((m = re.exec(text))) {
    const pre = text[m.index - 1]; if (pre && /[\d\/]/.test(pre)) continue;
    const p = s => s.split(' ').reduce((a, t) => a + (t.includes('/') ? t.split('/')[0] / t.split('/')[1] : +t), 0);
    const v = p(m[1]); const u = m[3].toLowerCase();
    const secs = Math.round(v * (u.startsWith('h') ? 3600 : u.startsWith('s') ? 1 : 60));
    if (secs >= 10 && secs <= 6 * 3600 && out.length < 3) out.push({ secs, label: m[0] });
  }
  return out.map(t => `<button class="tbtn" data-timer="${t.secs}" data-label="Step ${idx + 1}: ${esc(t.label)}">⏱ ${esc(t.label)}</button>`).join('');
}
function drawDetail(first) {
  const r = getRecipe(cur.id); if (!r) return;
  const f = cur.serves / r.serves;
  const body = $('#dBody'); const scroll = body.scrollTop;
  $('#dTitle').textContent = r.name;
  const embers = (first || !$('#dC')) ? Array.from({ length: 10 }, (_, i) => `<b style="left:${8 + i * 9}%;animation-delay:${(i * .37) % 2.6}s"></b>`).join('') : '';
  const sc = ingScore(r); const mt = missTools(r);
  if (first || !$('#dC')) body.innerHTML = `
  <div class="hero"><div class="board wood"></div><div class="steam"><i></i><i></i><i></i></div>
    ${pic(r, true)}<div class="embers">${embers}</div></div><div id="dC"></div>`;
  $('#dC').innerHTML = `
  <div class="dpad">
    <h2 class="dtitle">${esc(r.name)}</h2>
    <div class="meta"><span>${CAT_EMO[r.cat] || '🍽️'} ${r.cat}</span><span class="dm-wrap">${flames(r.diff)} ${r.diff}</span><span>⏱ ${fmtTime(r.mins)}</span><span>🌎 ${esc(r.cui)}</span>
      ${st.pantry.size ? `<span>🥫 ${sc.have}/${sc.total} stocked</span>` : ''}</div>
    <button class="btn cookbtn" id="aCook">👨‍🍳 Start Cook Mode</button>
    <div class="actions">
      <button id="aFav" class="${st.favs.has(r.id) ? 'on' : ''}"><span>${st.favs.has(r.id) ? '❤️' : '🤍'}</span>Favorite</button>
      <button id="aShare"><span>📤</span>Share Card</button>
      <button id="aEdit"><span>${r.mine ? '✏️' : '📝'}</span>${r.mine ? 'Edit' : 'Remix'}</button>
      ${r.mine ? '<button id="aDel"><span>🗑️</span>Delete</button>' : '<button id="aStock"><span>🛒</span>Missing</button>'}
    </div>
    <div class="panel"><h4>🍽️ Servings <small>original: ${r.serves}</small></h4>
      <div class="serv"><div class="stepper"><button id="sMinus">−</button><b>${cur.serves} ${cur.serves === 1 ? 'serving' : 'servings'}</b><button id="sPlus">+</button></div>
      ${cur.serves !== r.serves ? '<button class="btn sm ghost" id="sReset">Reset</button>' : `<span style="color:var(--muted);font-size:13px">×${num(f, 2)}</span>`}</div></div>
    ${nutPanel(r, cur.serves)}
    ${ratePanel(r)}
    <div class="panel"><h4>⚖️ Units</h4><div class="units">
      <div class="ul">Volume ${seg('vol', [['us', 'Cups/Tbsp'], ['floz', 'fl oz'], ['metric', 'ml/L']])}</div>
      <div class="ul">Weight ${seg('wt', [['us', 'oz/lb'], ['metric', 'g/kg']])}</div>
      <div class="ul">Temperature ${seg('temp', [['F', '°F'], ['C', '°C']])}</div></div></div>
    <div class="panel"><h4>🧂 Ingredients <small>tap to check off</small></h4>
      ${r.ing.map((i, k) => { const L = ingLine(i, f); const stp = isStaple(i.n); const h = haveIng(i);
        return `<div class="ing ${cur.ck.has(k) ? 'done' : ''}" data-ck="${k}"><div class="ck">${cur.ck.has(k) ? '✓' : ''}</div>
          <div class="itx">${L.tt ? '' : `<span class="q">${esc(L.q)}</span> `}${esc(cap(L.n))}${L.note || L.tt ? ` <span class="nt">${L.tt ? (L.note ? esc(L.note) : 'to taste') : '(' + esc(convTemps(L.note)) + ')'}</span>` : ''}</div>
          ${stp ? '<span class="have s">staple</span>' : h ? '<span class="have y">✓ have</span>' : `<span class="have n">${isOpt(i) ? 'optional' : 'need'}</span>`}</div>`; }).join('')}
    </div>
    <div class="panel"><h4>🍳 Tools & Appliances <small>${mt.length ? mt.length + ' missing' : st.tools.size ? 'you have it all!' : ''}</small></h4>
      <div class="toolchips">${r.tools.map(t => `<span class="tc ${st.tools.size ? (st.tools.has(t) ? 'y' : 'n') : ''}">${st.tools.size ? (st.tools.has(t) ? '✓ ' : '✗ ') : ''}${esc(t)}</span>`).join('')}</div></div>
    <div class="panel"><h4>👨‍🍳 Steps <small>tap a step when done</small></h4>
      ${r.steps.map((s, k) => `<div class="step ${cur.done.has(k) ? 'done' : ''}" data-step="${k}"><div class="num">${cur.done.has(k) ? '✓' : k + 1}</div>
        <div class="stx">${esc(convTemps(s))}<div>${timerChips(s, k)}</div></div></div>`).join('')}
    </div>
    ${(r.tags || []).length ? `<div class="tags">${r.tags.map(t => `<span>#${esc(t)}</span>`).join('')}</div>` : ''}
  </div>`;
  if (!first) body.scrollTop = scroll;
}
function nutPanel(r, serves) {
  const n = nutOf(r); const tot = x => Math.round(x * serves);
  const cell = (v, l, u = 'g') => `<div class="nut"><b>${Math.round(v)}${u}</b><small>${l}</small></div>`;
  return `<div class="panel"><h4>🥗 Nutrition <small>per serving · estimate</small></h4>
    <div class="nutgrid">${cell(n.cal, 'Calories', '')}${cell(n.p, 'Protein')}${cell(n.c, 'Carbs')}${cell(n.f, 'Fat')}</div>
    <div class="nutfoot">All ${serves} servings: ${tot(n.cal).toLocaleString()} cal · ${tot(n.p)}g protein · ${tot(n.c)}g carbs · ${tot(n.f)}g fat
    ${n.coverage < .95 ? `<br>Some ingredients aren't in the nutrition table, so the real numbers may be a bit higher.` : ''}<br>Calculated from the ingredient list using typical values. Brands and portions vary.</div></div>`;
}
function ratePanel(r) {
  const l = logOf(r.id), avg = ratingOf(r.id);
  return `<div class="panel"><h4>⭐ My Ratings & Cook Log <small>${l.length ? 'cooked ' + l.length + '×' : 'not cooked yet'}</small></h4>
    ${l.length ? `<div class="ravg">${avg ? starStr(avg, 'big') + `<b>${avg.toFixed(1)}</b>` : ''}</div>` : '<div class="sub" style="margin:0 0 10px">Cooked this? Log it to rate it and keep notes for next time.</div>'}
    ${l.slice().reverse().map(e => `<div class="logrow">${e.photo ? `<img src="${e.photo}" alt="">` : ''}<div class="lt"><div>${e.stars ? starStr(e.stars) : ''} <small>${new Date(e.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}${e.serves ? ' · ' + e.serves + ' servings' : ''}</small></div>
      ${e.note ? `<div class="lnote">“${esc(e.note)}”</div>` : ''}</div><button class="del" data-dellog="${e.at}">✕</button></div>`).join('')}
    <button class="btn sm steel" id="aLog" style="margin-top:8px">📝 Log a cook</button></div>`;
}
function seg(key, opts) { return `<div class="seg" data-seg="${key}">${opts.map(o => `<button class="${st.set[key] === o[0] ? 'on' : ''}" data-v="${o[0]}">${o[1]}</button>`).join('')}</div>`; }
$('#dBody').addEventListener('click', e => {
  const r = getRecipe(cur && cur.id); if (!r) return;
  const t = e.target;
  if (t.closest('[data-timer]')) { const b = t.closest('[data-timer]'); startTimer(+b.dataset.timer, b.dataset.label); return; }
  const sg = t.closest('[data-seg] button'); if (sg) { st.set[sg.parentNode.dataset.seg] = sg.dataset.v; save.set(); Snd.chop(); drawDetail(); return; }
  const ck = t.closest('[data-ck]'); if (ck) { const k = +ck.dataset.ck; cur.ck.has(k) ? cur.ck.delete(k) : cur.ck.add(k); Snd.chop(); drawDetail(); return; }
  const sp = t.closest('[data-step]'); if (sp) { const k = +sp.dataset.step; cur.done.has(k) ? cur.done.delete(k) : cur.done.add(k); Snd.chop();
    if (cur.done.size === r.steps.length) { Snd.ding(); toast('🎉 Order up! Yes, Chef!'); } drawDetail(); return; }
  if (t.closest('#sMinus')) { if (cur.serves > 1) { cur.serves--; Snd.chop(); drawDetail(); } return; }
  if (t.closest('#sPlus')) { if (cur.serves < 100) { cur.serves++; Snd.chop(); drawDetail(); } return; }
  if (t.closest('#sReset')) { cur.serves = r.serves; drawDetail(); return; }
  if (t.closest('#aFav')) { toggleFav(r.id); drawDetail(); return; }
  if (t.closest('#aShare')) { shareCard(r, cur.serves); return; }
  if (t.closest('#aCook')) { startCook(r, cur.serves); return; }
  if (t.closest('#aLog')) { rateModal(r, cur.serves); return; }
  const dl = t.closest('[data-dellog]'); if (dl) { st.log[r.id] = logOf(r.id).filter(e => String(e.at) !== dl.dataset.dellog); if (!st.log[r.id].length) delete st.log[r.id]; save.log(); Snd.chop(); drawDetail(); return; }
  if (t.closest('#aEdit')) { openEditor(r, !r.mine); return; }
  if (t.closest('#aDel')) {
    modal(`<h3 style="margin-top:0">Delete “${esc(r.name)}”?</h3><p style="color:var(--muted)">This can't be undone.</p><div class="row" style="justify-content:center"><button class="btn ghost" data-mclose>Cancel</button><button class="btn" id="mDel">Delete</button></div>`);
    $('#mDel').onclick = () => { st.custom = st.custom.filter(x => x.id !== r.id); st.favs.delete(r.id); save.custom(); save.favs(); closeModal(); closeSheet('detail'); cur = null; render(); toast('🗑️ Recipe deleted'); };
    return;
  }
  if (t.closest('#aStock')) {
    const miss = reqIng(r).filter(i => !haveIng(i)).map(i => i.n);
    const mt = missTools(r);
    modal(`<h3 style="margin-top:0">🛒 What you're missing</h3>
      ${miss.length ? `<p style="text-align:left"><b>Ingredients:</b><br>${miss.map(m => '• ' + esc(cap(m))).join('<br>')}</p>` : '<p>All ingredients stocked! ✅</p>'}
      ${mt.length && st.tools.size ? `<p style="text-align:left"><b>Tools:</b><br>${mt.map(m => '• ' + esc(m)).join('<br>')}</p>` : ''}
      <div class="row" style="justify-content:center">${miss.length ? '<button class="btn" id="mStock">I bought these → add to Pantry</button>' : ''}<button class="btn ghost" data-mclose>Close</button></div>`);
    const b = $('#mStock'); if (b) b.onclick = () => { miss.forEach(m => st.pantry.add(pkey(m))); save.pantry(); closeModal(); Snd.bubble(); toast('🥫 Added to Pantry'); drawDetail(); };
  }
});

/* ================= RATING MODAL ================= */
function rateModal(r, serves, fromCook) {
  let stars = 0, photo = null;
  modal(`<h3 style="margin:0 0 4px">${fromCook ? '🎉 Order up!' : '📝 Log a cook'}</h3><div style="color:var(--muted);font-size:14px">${fromCook ? 'How did it turn out?' : esc(r.name)}</div>
    <div class="starpick" id="sp">${[1, 2, 3, 4, 5].map(k => `<button data-s="${k}">★</button>`).join('')}</div>
    <textarea id="rNote" class="rnote" placeholder="Notes for next time… (e.g. less red pepper, add more garlic)"></textarea>
    <div class="row" style="justify-content:center;margin:8px 0"><label class="btn sm steel">📷 Add photo<input type="file" id="rPhoto" accept="image/*" style="display:none"></label><span id="rPrev"></span></div>
    <div class="row" style="justify-content:center"><button class="btn ghost" data-mclose>${fromCook ? 'Skip' : 'Cancel'}</button><button class="btn" id="rSave">Save</button></div>`);
  $('#sp').onclick = e => { const b = e.target.closest('[data-s]'); if (!b) return; stars = +b.dataset.s; $$('#sp button').forEach(x => x.classList.toggle('on', +x.dataset.s <= stars)); Snd.chop(); };
  $('#rPhoto').onchange = e => { const f = e.target.files[0]; if (!f) return; const url = URL.createObjectURL(f), im = new Image();
    im.onload = () => { const S = 360, c = document.createElement('canvas'); c.width = c.height = S; const m = Math.min(im.width, im.height);
      c.getContext('2d').drawImage(im, (im.width - m) / 2, (im.height - m) / 2, m, m, 0, 0, S, S); photo = c.toDataURL('image/jpeg', .72); URL.revokeObjectURL(url);
      $('#rPrev').innerHTML = `<img src="${photo}" style="width:46px;height:46px;border-radius:10px;object-fit:cover;margin:0">`; };
    im.src = url; };
  $('#rSave').onclick = () => {
    const note = $('#rNote').value.trim();
    if (!stars && !note && !photo) return toast('Tap the stars to rate it');
    const e = { at: Date.now(), stars, serves }; if (note) e.note = note; if (photo) e.photo = photo;
    (st.log[r.id] = logOf(r.id)).push(e); save.log(); closeModal(); Snd.ding(); toast(stars >= 4 ? '⭐ Chef\'s kiss! Saved.' : '📝 Saved to your cook log');
    if (cur && cur.id === r.id) drawDetail(); if (UI.tab !== 'pantry' && UI.tab !== 'kitchen') render();
  };
}

/* ================= COOK MODE ================= */
let ck = null, wakeLock = null;
async function keepAwake(on) {
  try { if (on && 'wakeLock' in navigator) { wakeLock = await navigator.wakeLock.request('screen'); } else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; } } catch (e) { }
}
document.addEventListener('visibilitychange', () => { if (ck && document.visibilityState === 'visible') keepAwake(true); });
function startCook(r, serves) {
  ck = { r, serves, i: 0, have: new Set() };
  $('#cook').classList.add('open'); keepAwake(true); drawCook(); Snd.sizzle();
}
function endCook(finished) {
  const r = ck && ck.r, serves = ck && ck.serves; $('#cook').classList.remove('open'); keepAwake(false); ck = null;
  if (finished && r) setTimeout(() => rateModal(r, serves, true), 350);
}
function drawCook() {
  const { r, serves, i } = ck, f = serves / r.serves, N = r.steps.length + 1;
  $('#ckTitle').textContent = r.name;
  $('#ckProg').style.width = (i / N * 100) + '%';
  $('#ckCount').textContent = i === 0 ? 'Get ready' : i === N ? 'Done!' : `Step ${i} of ${N - 1}`;
  let html;
  if (i === 0) {
    html = `<div class="ckhead">🧺 Gather everything</div><div class="cksub">${serves} servings · tap items as you set them out</div>
      ${r.ing.map((g, k) => { const L = ingLine(g, f); return `<button class="ckitem ${ck.have.has(k) ? 'on' : ''}" data-h="${k}"><span class="ck">${ck.have.has(k) ? '✓' : ''}</span><span>${L.tt ? '' : `<b>${esc(L.q)}</b> `}${esc(cap(L.n))}${L.note && !L.tt ? ` <small>(${esc(L.note)})</small>` : ''}${L.tt ? ' <small>(to taste)</small>' : ''}</span></button>`; }).join('')}
      <div class="ckhead sm">🍳 Tools</div><div class="toolchips">${r.tools.map(t => `<span class="tc">${esc(t)}</span>`).join('')}</div>`;
  } else if (i === N) {
    html = `<div class="ckdone"><div class="big">🎉</div><div class="ckhead">Order up, Chef!</div><div class="cksub">${esc(r.name)} is ready.</div>
      <button class="btn" id="ckFinish" style="font-size:18px;padding:14px 22px">⭐ Rate & log this cook</button></div>`;
  } else {
    const s = r.steps[i - 1];
    html = `<div class="cknum">${i}</div><div class="cktext">${esc(convTemps(s))}</div><div class="cktimers">${timerChips(s, i - 1)}</div>
      ${i < N - 1 ? `<div class="cknext"><small>NEXT</small>${esc(convTemps(r.steps[i])).slice(0, 110)}${r.steps[i].length > 110 ? '…' : ''}</div>` : ''}`;
  }
  const b = $('#ckBody'); b.innerHTML = `<div class="ckslide">${html}</div>`; b.scrollTop = 0;
  $('#ckPrev').disabled = i === 0; $('#ckNext').textContent = i === 0 ? "Let's cook →" : i === N - 1 ? 'Finish ✓' : i === N ? 'Close' : 'Next →';
}
function ckGo(d) {
  if (!ck) return; const N = ck.r.steps.length + 1;
  if (d > 0 && ck.i === N) { endCook(false); return; }
  const n = Math.max(0, Math.min(N, ck.i + d)); if (n === ck.i) return;
  ck.i = n; n === N ? Snd.ding() : Snd.whoosh(); drawCook();
}
$('#ckPrev').onclick = () => ckGo(-1); $('#ckNext').onclick = () => ckGo(1);
$('#ckClose').onclick = () => { if (ck && ck.i > 0 && ck.i < ck.r.steps.length + 1) { modal(`<h3 style="margin-top:0">Leave Cook Mode?</h3><div class="row" style="justify-content:center"><button class="btn ghost" data-mclose>Keep cooking</button><button class="btn" id="ckLeave">Leave</button></div>`); $('#ckLeave').onclick = () => { closeModal(); endCook(false); }; } else endCook(false); };
$('#ckBody').addEventListener('click', e => {
  const tb = e.target.closest('[data-timer]'); if (tb) { startTimer(+tb.dataset.timer, ck.r.name.slice(0, 18) + ' · ' + tb.dataset.label); return; }
  const h = e.target.closest('[data-h]'); if (h) { const k = +h.dataset.h; ck.have.has(k) ? ck.have.delete(k) : ck.have.add(k); h.classList.toggle('on'); $('.ck', h).textContent = ck.have.has(k) ? '✓' : ''; Snd.chop(); return; }
  if (e.target.closest('#ckFinish')) endCook(true);
});
(() => { let x0 = null, y0 = 0; const el = $('#ckBody');
  el.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  el.addEventListener('touchend', e => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0; x0 = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) ckGo(dx < 0 ? 1 : -1); }, { passive: true }); })();

/* ================= TIMERS ================= */
const timers = [];
function startTimer(secs, label) {
  timers.push({ id: Date.now() + Math.random(), end: Date.now() + secs * 1000, label, rang: false });
  Snd.bubble(); toast('⏱ Timer started'); drawTimers();
}
function drawTimers() {
  $('#timers').innerHTML = timers.map(t => {
    const left = Math.max(0, Math.round((t.end - Date.now()) / 1000));
    const h = Math.floor(left / 3600), m = Math.floor(left % 3600 / 60), s = left % 60;
    const txt = (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
    return `<div class="timer ${left === 0 ? 'ring' : ''}" data-tid="${t.id}"><b>${left === 0 ? 'DONE!' : txt}</b><span>${esc(t.label)}</span><button class="del" data-tx="${t.id}">✕</button></div>`;
  }).join('');
}
$('#timers').addEventListener('click', e => { const x = e.target.closest('[data-tx]'); if (x) { const i = timers.findIndex(t => String(t.id) === x.dataset.tx); if (i > -1) timers.splice(i, 1); drawTimers(); } });
setInterval(() => {
  if (!timers.length) return;
  timers.forEach(t => { if (!t.rang && Date.now() >= t.end) { t.rang = true; Snd.alarm(); if (navigator.vibrate) navigator.vibrate([300, 150, 300]); toast('⏰ ' + t.label.split(':')[0] + ' timer done!'); } });
  drawTimers();
}, 500);

/* ================= SHARE CARD ================= */
function wrap(ctx, text, maxW) {
  const words = String(text).split(/\s+/); const lines = []; let line = '';
  for (const w of words) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
  if (line) lines.push(line); return lines;
}
function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function cardLayout(ctx, r, serves, draw, H, photo) {
  const W = 1080, P = 90, f = serves / r.serves; let y = 150;
  const SERIF = 'Georgia, "Times New Roman", serif', SANS = '-apple-system, "Helvetica Neue", Arial, sans-serif';
  const EMO = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  const ink = '#2e1b0c', ember = '#b8410a';
  if (draw) {
    ctx.fillStyle = '#141009'; ctx.fillRect(0, 0, W, H);
    const g = ctx.createRadialGradient(W / 2, H + 100, 50, W / 2, H + 100, 900); g.addColorStop(0, 'rgba(255,110,20,.55)'); g.addColorStop(1, 'rgba(255,110,20,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // board
    const bg = ctx.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#ecca97'); bg.addColorStop(.5, '#cf9d63'); bg.addColorStop(1, '#b37d46');
    ctx.save(); rrect(ctx, 40, 40, W - 80, H - 80, 60); ctx.fillStyle = bg; ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 12; ctx.fill(); ctx.restore();
    ctx.save(); rrect(ctx, 40, 40, W - 80, H - 80, 60); ctx.clip();
    let seed = 7; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    for (let i = 0; i < 70; i++) {
      ctx.strokeStyle = `rgba(110,60,20,${.05 + rnd() * .09})`; ctx.lineWidth = 1 + rnd() * 2.5; ctx.beginPath();
      const yy = rnd() * H, amp = 4 + rnd() * 14, fr = .004 + rnd() * .006, ph = rnd() * 6;
      for (let x = 40; x <= W - 40; x += 20) { const yv = yy + Math.sin(x * fr + ph) * amp; x === 40 ? ctx.moveTo(x, yv) : ctx.lineTo(x, yv); } ctx.stroke();
    }
    ctx.restore();
    ctx.save(); rrect(ctx, 40, 40, W - 80, H - 80, 60); ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(90,50,15,.55)'; ctx.stroke(); ctx.restore();
    // handle hole
    ctx.fillStyle = '#141009'; ctx.beginPath(); ctx.arc(W / 2, 95, 22, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(90,50,15,.6)'; ctx.lineWidth = 4; ctx.stroke();
  }
  // plate + emoji
  y = 150;
  if (draw) {
    const pg = ctx.createRadialGradient(W / 2 - 25, y + 85, 10, W / 2, y + 100, 110); pg.addColorStop(0, '#ffffff'); pg.addColorStop(.6, '#dfe2e5'); pg.addColorStop(1, '#8f979e');
    ctx.save(); ctx.shadowColor = 'rgba(40,20,5,.5)'; ctx.shadowBlur = 25; ctx.shadowOffsetY = 10; ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(W / 2, y + 100, 100, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    if (photo) { ctx.save(); ctx.beginPath(); ctx.arc(W / 2, y + 100, 100, 0, Math.PI * 2); ctx.clip(); ctx.drawImage(photo, W / 2 - 104, y - 4, 208, 208); ctx.restore(); }
    else { ctx.font = `120px ${EMO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(r.emoji || '🍽️', W / 2, y + 108); }
  }
  y += 240; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.font = `bold 66px ${SERIF}`;
  for (const l of wrap(ctx, r.name, W - 2 * P)) { if (draw) { ctx.fillStyle = ink; ctx.fillText(l, W / 2, y + 56); } y += 76; }
  ctx.font = `600 32px ${SANS}`;
  const meta = `${r.cat}  •  ${r.diff}  •  ${fmtTime(r.mins)}  •  Serves ${serves}`;
  if (draw) { ctx.fillStyle = ember; ctx.fillText(meta, W / 2, y + 30); } y += 64;
  const rule = () => { if (draw) { ctx.strokeStyle = 'rgba(90,50,15,.45)'; ctx.lineWidth = 3; ctx.setLineDash([14, 10]); ctx.beginPath(); ctx.moveTo(P, y); ctx.lineTo(W - P, y); ctx.stroke(); ctx.setLineDash([]); } y += 40; };
  const head = t => { ctx.textAlign = 'left'; ctx.font = `800 34px ${SANS}`; if (draw) { ctx.fillStyle = ember; ctx.fillText(t, P, y + 28); } y += 56; };
  rule(); head('🧂 INGREDIENTS');
  ctx.font = `32px ${SANS}`;
  const lines = r.ing.map(i => { const L = ingLine(i, f); return '• ' + (L.tt ? '' : L.q + ' ') + cap(L.n) + (L.tt ? (L.note ? ' (' + L.note + ')' : ' (to taste)') : ''); });
  const two = lines.length > 7, colW = two ? (W - 2 * P - 40) / 2 : W - 2 * P;
  const cols = two ? [lines.slice(0, Math.ceil(lines.length / 2)), lines.slice(Math.ceil(lines.length / 2))] : [lines];
  let maxY = y;
  cols.forEach((col, ci) => { let yy = y; const x = P + ci * (colW + 40);
    col.forEach(l => wrap(ctx, l, colW).forEach((w, wi) => { if (draw) { ctx.fillStyle = ink; ctx.fillText((wi ? '   ' : '') + w, x, yy + 28); } yy += 42; }));
    maxY = Math.max(maxY, yy); });
  y = maxY + 18; rule(); head('🍳 TOOLS & APPLIANCES');
  ctx.font = `28px ${SANS}`;
  wrap(ctx, r.tools.join('  •  '), W - 2 * P).forEach(l => { if (draw) { ctx.fillStyle = ink; ctx.fillText(l, P, y + 26); } y += 38; });
  y += 18; rule(); head('👨‍🍳 STEPS');
  r.steps.forEach((s, k) => {
    ctx.font = `30px ${SANS}`; const ls = wrap(ctx, convTemps(s), W - 2 * P - 70);
    if (draw) { ctx.fillStyle = '#d9480f'; ctx.beginPath(); ctx.arc(P + 22, y + 18, 22, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff3e0'; ctx.font = `800 24px ${SANS}`; ctx.textAlign = 'center'; ctx.fillText(k + 1, P + 22, y + 27); ctx.textAlign = 'left'; ctx.font = `30px ${SANS}`; }
    ls.forEach(l => { if (draw) { ctx.fillStyle = ink; ctx.fillText(l, P + 70, y + 28); } y += 41; }); y += 16;
  });
  y += 10; rule();
  ctx.textAlign = 'center'; ctx.font = `bold 38px ${SERIF}`;
  if (draw) { ctx.fillStyle = ember; ctx.fillText('🔥 Yes, Chef! 🔥', W / 2, y + 30); }
  y += 110; return y;
}
async function shareCard(r, serves) {
  toast('🔪 Plating your card…');
  let photo = null; const src = picSrc(r);
  if (src) photo = await new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
  const c = document.createElement('canvas'), ctx = c.getContext('2d'); c.width = 1080; c.height = 100;
  const H = Math.min(9000, Math.ceil(cardLayout(ctx, r, serves, false, 0)));
  c.height = H; cardLayout(ctx, r, serves, true, H, photo);
  c.toBlob(async blob => {
    if (!blob) return toast('Could not create card');
    const fname = r.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '-yes-chef.png';
    const file = new File([blob], fname, { type: 'image/png' });
    Snd.ding();
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: r.name, text: `${r.name} — from Yes, Chef! 🔥` }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    const url = URL.createObjectURL(blob);
    modal(`<h3 style="margin-top:0">📤 Recipe Card</h3><div style="color:var(--muted);font-size:13px">Long-press the image to save or share it.</div><img src="${url}" alt="Recipe card"><div class="row" style="justify-content:center"><a class="btn" href="${url}" download="${fname}">Download</a><button class="btn ghost" data-mclose>Close</button></div>`);
  }, 'image/png');
}

/* ================= MATCH VIEW ================= */
function vMatch() {
  const sel = new Set(st.set.mSel);
  main.innerHTML = `<div class="view">
    <h2 class="sec">What can I make? <span class="bubbles"><i></i><i></i><i></i></span></h2>
    <div class="sub">Pick ingredients you have on hand, and Yes, Chef will find matching recipes.</div>
    <div class="search"><input id="mq" type="search" placeholder="Type an ingredient…" autocomplete="off" list="dlIng"><button class="btn sm" id="mAdd">Add</button></div>
    <div class="sugg" id="msugg"></div>
    <div class="selbox" id="msel">${sel.size ? [...sel].map(n => `<span class="pill">${esc(n)} <b data-rm="${esc(n)}">✕</b></span>`).join('') : '<span class="ph">No ingredients selected yet…</span>'}</div>
    <div class="row"><button class="btn sm steel" id="mPantry">🥫 Use my Pantry (${st.pantry.size})</button><button class="btn sm ghost" id="mClear">Clear</button></div>
    <div class="panel"><h4>Options</h4>
      <div class="row" style="justify-content:space-between;margin:0 0 6px"><span style="font-size:14px">Allow missing ingredients</span>
        <div class="seg" id="mMiss">${[0, 1, 2, 3].map(n => `<button class="${st.set.mMiss === n ? 'on' : ''}" data-n="${n}">${n}</button>`).join('')}</div></div>
      <button class="tog ${st.set.mTools ? 'on' : ''}" id="mTools"><span class="sw"></span>Only recipes my kitchen tools can handle</button><br>
      <button class="tog ${st.set.staples ? 'on' : ''}" id="mStap"><span class="sw"></span>Assume I have salt, pepper & water</button>
    </div>
    <div id="mres"></div></div>`;
  const mq = $('#mq');
  const add = n => { n = pkey(n); if (!n) return; st.set.mSel = [...new Set([...st.set.mSel, n])]; save.set(); Snd.bubble(); vMatch(); setTimeout(() => $('#mq') && $('#mq').focus(), 30); };
  mq.addEventListener('input', () => {
    const q = mq.value.trim().toLowerCase(); const box = $('#msugg');
    if (q.length < 2) { box.innerHTML = ''; return; }
    box.innerHTML = allPantry().filter(p => p.n.includes(q) && !sel.has(p.n)).slice(0, 10).map(p => `<button data-add="${esc(p.n)}">+ ${esc(p.n)}</button>`).join('');
  });
  mq.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); add(mq.value); } });
  $('#mAdd').onclick = () => add(mq.value);
  $('#msugg').onclick = e => { const b = e.target.closest('[data-add]'); if (b) add(b.dataset.add); };
  $('#msel').onclick = e => { const b = e.target.closest('[data-rm]'); if (b) { st.set.mSel = st.set.mSel.filter(x => x !== b.dataset.rm); save.set(); Snd.chop(); vMatch(); } };
  $('#mPantry').onclick = () => { if (!st.pantry.size) return toast('Your Pantry is empty — stock it first!'); st.set.mSel = [...st.pantry]; save.set(); Snd.bubble(); vMatch(); };
  $('#mClear').onclick = () => { st.set.mSel = []; save.set(); Snd.chop(); vMatch(); };
  $('#mMiss').onclick = e => { const b = e.target.closest('[data-n]'); if (b) { st.set.mMiss = +b.dataset.n; save.set(); Snd.chop(); vMatch(); } };
  $('#mTools').onclick = () => { st.set.mTools = !st.set.mTools; save.set(); Snd.chop(); vMatch(); };
  $('#mStap').onclick = () => { st.set.staples = !st.set.staples; save.set(); Snd.chop(); vMatch(); };
  drawMatch(sel);
}
function drawMatch(sel) {
  const el = $('#mres');
  if (!sel.size) { el.innerHTML = '<div class="empty"><span class="big">🥕🧅🧄</span>Add a few ingredients to start cooking up ideas.</div>'; return; }
  const res = [];
  for (const r of allRecipes()) {
    const s = ingScore(r, sel); if (!s.have) continue;
    if (s.miss.length > st.set.mMiss) continue;
    if (st.set.mTools && missTools(r).length) continue;
    res.push({ r, s });
  }
  res.sort((a, b) => a.s.miss.length - b.s.miss.length || (b.s.have / b.s.total) - (a.s.have / a.s.total) || a.r.mins - b.r.mins);
  const ready = res.filter(x => !x.s.miss.length), almost = res.filter(x => x.s.miss.length);
  const row = ({ r, s }) => `<div class="res wood" data-open="${r.id}">${pic(r)}
    <div class="rt"><div class="rn">${esc(r.name)}</div><div class="rm">${r.cat} · ⏱ ${fmtTime(r.mins)} · ${flames(r.diff)}</div>
    ${s.miss.length ? `<div class="miss">Missing: ${s.miss.map(esc).join(', ')}</div>` : ''}</div><div class="pct">${Math.round(s.have / s.total * 100)}%</div></div>`;
  el.innerHTML = (ready.length ? `<h2 class="sec">🔥 Ready to cook (${ready.length})</h2>${ready.map(row).join('')}` : '') +
    (almost.length ? `<h2 class="sec">🧺 Almost there (${almost.length})</h2>${almost.slice(0, 80).map(row).join('')}` : '') +
    (!res.length ? `<div class="empty"><span class="big">🤔</span>No matches yet. Add more ingredients or allow more missing items.</div>` : '');
}

/* ================= PANTRY VIEW ================= */
const BASICS = ['salt', 'black pepper', 'all-purpose flour', 'granulated sugar', 'brown sugar', 'baking powder', 'baking soda', 'eggs', 'milk', 'butter', 'vegetable oil', 'olive oil', 'garlic', 'yellow onion', 'white onion', 'ground cumin', 'chili powder', 'garlic powder', 'onion powder', 'paprika', 'dried oregano', 'ground cinnamon', 'vanilla extract', 'long-grain white rice', 'spaghetti', 'chicken broth', 'soy sauce', 'ketchup', 'yellow mustard', 'mayonnaise', 'hot sauce', 'honey', 'corn tortillas', 'flour tortillas', 'lemons', 'limes', 'cheddar cheese', 'red pepper flakes', 'italian seasoning', 'bay leaves', 'cornstarch', 'water'];
function groupBy(list, key) { const m = new Map(); list.forEach(x => { const k = x[key] || 'Other'; if (!m.has(k)) m.set(k, []); m.get(k).push(x); }); return m; }
const PCAT_EMO = { 'Produce': '🥬', 'Meat & Seafood': '🥩', 'Dairy & Eggs': '🥚', 'Bread & Tortillas': '🫓', 'Grains, Pasta & Beans': '🍝', 'Canned & Jarred': '🥫', 'Baking': '🧁', 'Spices & Seasonings': '🌶️', 'Oils, Vinegars & Sauces': '🫒', 'Nuts & Snacks': '🥜', 'Frozen': '🧊', 'Beverages & Other': '🧃', 'Other': '📦', 'My Ingredients': '⭐' };
const openCats = new Set();
function vPantry() {
  const all = allPantry();
  main.innerHTML = `<div class="view">
    <div class="statbar"><div class="stat wood"><b>${st.pantry.size}</b><small>IN STOCK</small></div><div class="stat wood"><b>${all.length}</b><small>INGREDIENTS</small></div>
      <div class="stat wood"><b>${allRecipes().filter(r => ingScore(r).miss.length === 0).length}</b><small>RECIPES READY</small></div></div>
    <div class="search"><input id="pq" type="search" placeholder="Search or add your own ingredient…" value="${esc(UI.pq)}" autocomplete="off"><button class="btn sm" id="pAdd">+ Add</button></div>
    <div class="row"><div class="seg" id="pf">${[['all', 'All'], ['in', 'In Stock'], ['out', 'Not Stocked']].map(o => `<button class="${UI.pf === o[0] ? 'on' : ''}" data-f="${o[0]}">${o[1]}</button>`).join('')}</div>
      <button class="btn sm steel" id="pBasics">⚡ Basics</button><button class="btn sm ghost" id="pClear">Clear all</button></div>
    <div id="plist"></div></div>`;
  drawPantry();
  const pq = $('#pq'); pq.addEventListener('input', () => { UI.pq = pq.value; drawPantry(); });
  $('#pf').onclick = e => { const b = e.target.closest('[data-f]'); if (b) { UI.pf = b.dataset.f; $$('#pf button').forEach(x => x.classList.toggle('on', x === b)); drawPantry(); } };
  const bulk = (fn, msg) => { const before = [...st.pantry]; fn(); save.pantry(); vPantry(); Snd.bubble();
    toast(msg, 'Undo', () => { st.pantry = new Set(before); save.pantry(); if (UI.tab === 'pantry') vPantry(); Snd.chop(); }); };
  $('#pBasics').onclick = () => bulk(() => BASICS.forEach(b => st.pantry.add(b)), '⚡ Basics stocked!');
  $('#pClear').onclick = () => { if (!st.pantry.size) return toast('Already empty'); bulk(() => st.pantry.clear(), '🧹 Pantry cleared'); };
  $('#pAdd').onclick = () => addMyIng(pq.value);
  pq.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addMyIng(pq.value); } });
}
function addMyIng(raw) {
  const n = String(raw || '').trim().toLowerCase();
  if (!n) return toast('Type an ingredient name first');
  if (allPantry().some(p => p.n === n)) { st.pantry.add(n); save.pantry(); UI.pq = ''; Snd.bubble(); toast('✓ ' + cap(n) + ' is in stock'); vPantry(); return; }
  st.myIng.push({ n }); st.pantry.add(n); save.myIng(); save.pantry(); refreshDatalist(); UI.pq = ''; openCats.add('My Ingredients');
  Snd.bubble(); toast('⭐ Added ' + cap(n)); vPantry();
}
function drawPantry() {
  const q = UI.pq.trim().toLowerCase();
  const list = allPantry().filter(p => (!q || p.n.includes(q)) && (UI.pf === 'all' || (UI.pf === 'in') === st.pantry.has(p.n)));
  const groups = groupBy(list, 'c'); const el = $('#plist');
  if (!list.length) { el.innerHTML = `<div class="empty"><span class="big">🥫</span>${q ? `No match. Tap <b>+ Add</b> to add “${esc(q)}” to your pantry.` : 'Nothing here yet.'}</div>`; return; }
  el.innerHTML = [...groups].map(([c, items]) => {
    const inC = items.filter(i => st.pantry.has(i.n)).length;
    return `<details class="cat" ${q || openCats.has(c) ? 'open' : ''} data-cat="${esc(c)}"><summary><span>${PCAT_EMO[c] || '📦'}</span>${esc(c)}<span class="n">${inC}/${items.length}</span><span class="ar">▶</span></summary>
      <div class="inner"><div class="acts"><button class="btn sm ghost" data-all="${esc(c)}">Select all</button><button class="btn sm ghost" data-none="${esc(c)}">Clear</button></div>
      <div class="items">${items.map(i => `<button class="item ${st.pantry.has(i.n) ? 'on' : ''}" data-p="${esc(i.n)}">${esc(i.n)}${i.mine ? `<span class="x" data-delp="${esc(i.n)}">✕</span>` : ''}</button>`).join('')}</div></div></details>`;
  }).join('');
  $$('#plist details').forEach(d => d.addEventListener('toggle', () => { d.open ? openCats.add(d.dataset.cat) : openCats.delete(d.dataset.cat); }));
}
main.addEventListener('click', e => {
  if (UI.tab !== 'pantry') return;
  const del = e.target.closest('[data-delp]');
  if (del) { e.stopPropagation(); const n = del.dataset.delp; st.myIng = st.myIng.filter(x => x.n !== n); st.pantry.delete(n); save.myIng(); save.pantry(); refreshDatalist(); Snd.chop(); drawPantry(); return; }
  const it = e.target.closest('[data-p]');
  if (it) { const n = it.dataset.p; const on = !st.pantry.has(n); on ? st.pantry.add(n) : st.pantry.delete(n); it.classList.toggle('on', on); save.pantry(); updCatCount(it); on ? Snd.bubble() : Snd.chop(); return; }
  const a = e.target.closest('[data-all]'), z = e.target.closest('[data-none]');
  if (a || z) { const c = (a || z).dataset[a ? 'all' : 'none']; allPantry().filter(p => p.c === c).forEach(p => a ? st.pantry.add(p.n) : st.pantry.delete(p.n)); save.pantry(); drawPantry(); updStats(); a ? Snd.bubble() : Snd.chop(); }
});
function updCatCount(it) { const d = it && it.closest('details'); if (d) { const all = $$('.item', d); $('.n', d).textContent = all.filter(x => x.classList.contains('on')).length + '/' + all.length; } updStats(); }
function updStats() {
  const s = $$('.stat b'); if (!s.length) return;
  if (UI.tab === 'pantry') { s[0].textContent = st.pantry.size; s[2].textContent = allRecipes().filter(r => ingScore(r).miss.length === 0).length; }
  if (UI.tab === 'kitchen') { s[0].textContent = st.tools.size; s[2].textContent = allRecipes().filter(r => !missTools(r).length).length; }
}

/* ================= KITCHEN VIEW ================= */
const COMMON_TOOLS = ["Chef's knife", 'Paring knife', 'Cutting board', 'Measuring cups', 'Measuring spoons', 'Mixing bowls', 'Box grater', 'Vegetable peeler', 'Can opener', 'Colander', 'Whisk', 'Rubber spatula', 'Flipper / turner spatula', 'Wooden spoon', 'Tongs', 'Ladle', 'Potato masher', 'Oven mitts', 'Slotted spoon', 'Nonstick skillet', 'Saucepan', 'Stockpot', 'Baking sheet', '9x13 baking dish', 'Muffin tin', 'Loaf pan', 'Cooling rack', 'Parchment paper', 'Aluminum foil', 'Plastic wrap', 'Oven', 'Stovetop / range', 'Microwave', 'Toaster', 'Blender', 'Hand mixer', 'Coffee maker'];
const TG_EMO = { 'Knives & Prep': '🔪', 'Utensils': '🥄', 'Cookware': '🍳', 'Bakeware': '🧁', 'Wraps & Paper': '🧻', 'Appliances': '🔌', 'My Tools': '⭐' };
const openGroups = new Set(['Appliances']);
function vKitchen() {
  const all = allTools();
  main.innerHTML = `<div class="view">
    <div class="statbar"><div class="stat wood"><b>${st.tools.size}</b><small>I HAVE</small></div><div class="stat wood"><b>${all.length}</b><small>KITCHEN ITEMS</small></div>
      <div class="stat wood"><b>${allRecipes().filter(r => !missTools(r).length).length}</b><small>RECIPES POSSIBLE</small></div></div>
    <div class="search"><input id="kq" type="search" placeholder="Search or add a tool / appliance…" value="${esc(UI.kq)}" autocomplete="off"><button class="btn sm" id="kAdd">+ Add</button></div>
    <div class="row"><button class="btn sm steel" id="kCommon">⚡ Typical kitchen</button><button class="btn sm ghost" id="kAll">I have everything</button><button class="btn sm ghost" id="kClear">Clear all</button></div>
    <div id="klist"></div></div>`;
  drawKitchen();
  const kq = $('#kq'); kq.addEventListener('input', () => { UI.kq = kq.value; drawKitchen(); });
  const add = () => { const n = kq.value.trim(); if (!n) return toast('Type a tool name first');
    const ex = allTools().find(t => t.n.toLowerCase() === n.toLowerCase());
    if (ex) st.tools.add(ex.n); else { st.myTools.push({ n: cap(n) }); st.tools.add(cap(n)); save.myTools(); openGroups.add('My Tools'); }
    save.tools(); UI.kq = ''; Snd.bubble(); toast('🍳 Added'); vKitchen(); };
  $('#kAdd').onclick = add; kq.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
  const bulk = (fn, msg) => { const before = [...st.tools]; fn(); save.tools(); vKitchen(); Snd.bubble();
    toast(msg, 'Undo', () => { st.tools = new Set(before); save.tools(); if (UI.tab === 'kitchen') vKitchen(); Snd.chop(); }); };
  $('#kCommon').onclick = () => bulk(() => COMMON_TOOLS.forEach(t => st.tools.add(t)), '⚡ Typical kitchen stocked');
  $('#kAll').onclick = () => bulk(() => allTools().forEach(t => st.tools.add(t.n)), '✅ Marked everything');
  $('#kClear').onclick = () => { if (!st.tools.size) return toast('Already empty'); bulk(() => st.tools.clear(), '🧹 Kitchen cleared'); };
}
function drawKitchen() {
  const q = UI.kq.trim().toLowerCase(); const list = allTools().filter(t => !q || t.n.toLowerCase().includes(q));
  const groups = groupBy(list, 'g');
  $('#klist').innerHTML = !list.length ? `<div class="empty"><span class="big">🍳</span>No match — tap <b>+ Add</b> to add “${esc(q)}”.</div>` : [...groups].map(([g, items]) => {
    const inG = items.filter(i => st.tools.has(i.n)).length;
    return `<details class="cat" ${q || openGroups.has(g) ? 'open' : ''} data-g="${esc(g)}"><summary><span>${TG_EMO[g] || '🔧'}</span>${esc(g)}<span class="n">${inG}/${items.length}</span><span class="ar">▶</span></summary>
      <div class="inner"><div class="acts"><button class="btn sm ghost" data-tall="${esc(g)}">Select all</button><button class="btn sm ghost" data-tnone="${esc(g)}">Clear</button></div>
      <div class="items">${items.map(i => `<button class="item ${st.tools.has(i.n) ? 'on' : ''}" style="text-transform:none" data-t="${esc(i.n)}">${esc(i.n)}${i.mine ? `<span class="x" data-delt="${esc(i.n)}">✕</span>` : ''}</button>`).join('')}</div></div></details>`;
  }).join('');
  $$('#klist details').forEach(d => d.addEventListener('toggle', () => { d.open ? openGroups.add(d.dataset.g) : openGroups.delete(d.dataset.g); }));
}
main.addEventListener('click', e => {
  if (UI.tab !== 'kitchen') return;
  const del = e.target.closest('[data-delt]');
  if (del) { e.stopPropagation(); const n = del.dataset.delt; st.myTools = st.myTools.filter(x => x.n !== n); st.tools.delete(n); save.myTools(); save.tools(); drawKitchen(); return; }
  const it = e.target.closest('[data-t]');
  if (it) { const n = it.dataset.t; const on = !st.tools.has(n); on ? st.tools.add(n) : st.tools.delete(n); it.classList.toggle('on', on); save.tools(); updCatCount2(it); on ? Snd.bubble() : Snd.chop(); return; }
  const a = e.target.closest('[data-tall]'), z = e.target.closest('[data-tnone]');
  if (a || z) { const g = (a || z).dataset[a ? 'tall' : 'tnone']; allTools().filter(t => (t.g || 'My Tools') === g).forEach(t => a ? st.tools.add(t.n) : st.tools.delete(t.n)); save.tools(); drawKitchen(); updStats(); }
});
const updCatCount2 = updCatCount;

/* ================= FAVORITES VIEW ================= */
function vFavs() {
  const favs = allRecipes().filter(r => st.favs.has(r.id)).sort((a, b) => a.name.localeCompare(b.name));
  main.innerHTML = `<div class="view">
    <h2 class="sec">❤️ Favorites</h2>
    ${favs.length ? `<div class="grid">${favs.map(card).join('')}</div>` : '<div class="empty"><span class="big">🤍</span>Tap the ♥ on any recipe to save it here.</div>'}
    <h2 class="sec" style="margin-top:24px">📒 My Recipes</h2>
    <div class="grid">${st.custom.map(card).join('')}
      <div class="card wood pop" id="fNew" style="display:grid;place-items:center;min-height:190px"><div><div style="font-size:46px">➕</div><div class="cname" style="min-height:0">Create a Recipe</div></div></div></div>
  </div>`;
  $('#fNew').onclick = () => openEditor(null);
}

/* ================= EDITOR ================= */
const EMOJIS = ['🍳', '🥞', '🧇', '🥓', '🥚', '🥯', '🥐', '🍞', '🥪', '🌮', '🌯', '🫔', '🥙', '🧆', '🍔', '🍕', '🌭', '🍟', '🍗', '🍖', '🥩', '🐟', '🍤', '🦐', '🦀', '🍝', '🍜', '🍲', '🥘', '🍛', '🍚', '🥗', '🥑', '🌶️', '🌽', '🥔', '🧀', '🍄', '🥦', '🍅', '🍎', '🍌', '🍓', '🫐', '🍋', '🍑', '🥥', '🍰', '🎂', '🧁', '🥧', '🍪', '🍩', '🍫', '🍮', '🍨', '🍦', '☕', '🥤', '🍹'];
const UNITS = ['', 'tsp', 'tbsp', 'cup', 'floz', 'ml', 'l', 'oz', 'lb', 'g', 'kg', 'pinch', 'dash', 'clove', 'slice', 'can', 'pkg', 'jar', 'bunch', 'sprig', 'stick', 'head', 'loaf'];
const UNIT_LBL = { '': '(count)', floz: 'fl oz', l: 'L' };
let ed = null;
function parseQty(s) {
  s = String(s || '').trim(); if (!s || s === '~') return null;
  const map = { '½': .5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': .25, '¾': .75, '⅛': .125 };
  let t = 0, okk = false;
  s.replace(/[½⅓⅔¼¾⅛]/g, m => ' ' + m).split(/\s+/).forEach(p => {
    if (map[p]) { t += map[p]; okk = true; } else if (/^\d+\/\d+$/.test(p)) { const [a, b] = p.split('/'); t += a / b; okk = true; } else if (!isNaN(parseFloat(p))) { t += parseFloat(p); okk = true; }
  });
  return okk ? Math.round(t * 1000) / 1000 : null;
}
const qtyStr = q => q == null ? '' : (Math.abs(q - Math.round(q)) < .01 ? String(Math.round(q)) : frac(q));
function openEditor(r, isCopy) {
  ed = r ? JSON.parse(JSON.stringify(r)) : { name: '', cat: 'Dinner', diff: 'Easy', mins: 30, serves: 4, cui: 'American', emoji: '🍳', ing: [{ q: 1, u: 'cup', n: '' }], tools: [], steps: [''], tags: [] };
  if (isCopy) { delete ed.id; ed.name = ed.name + ' (My Version)'; }
  ed.isNew = !ed.id || isCopy;
  $('#eTitle').textContent = ed.isNew ? (isCopy ? 'Remix Recipe' : 'New Recipe') : 'Edit Recipe';
  drawEditor(); openSheet('editor'); $('#eBody').scrollTop = 0; Snd.whoosh();
}
function syncEd() {
  const b = $('#eBody'); if (!b.firstChild) return;
  ed.name = $('#fName').value; ed.cat = $('#fCat').value; ed.diff = $('#fDiff').value; ed.mins = parseInt($('#fMins').value) || 0;
  ed.serves = Math.max(1, parseInt($('#fServ').value) || 1); ed.cui = $('#fCui').value || 'Homemade';
  ed.tags = $('#fTags').value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  ed.ing = $$('.irow', b).map(r => ({ q: parseQty($('.iq', r).value), u: $('.iu', r).value, n: $('.in', r).value.trim().toLowerCase(), note: $('.inote', r).value.trim() }));
  ed.steps = $$('.srow textarea', b).map(t => t.value);
}
function drawEditor() {
  const tg = groupBy(allTools(), 'g');
  $('#eBody').innerHTML = `<div class="form">
    <label>Recipe name</label><input id="fName" value="${esc(ed.name)}" placeholder="Grandma's Famous Enchiladas">
    <label>Photo</label>
    <div class="photorow">${ed.photo ? `<div class="plate photo own"><img src="${ed.photo}" alt=""></div>` : `<div class="plate"><span class="emo">${esc(ed.emoji)}</span></div>`}
      <div style="display:flex;flex-direction:column;gap:8px"><label class="btn sm" style="margin:0;text-transform:none;letter-spacing:0;color:#1b0f05">📷 Take / choose photo<input type="file" id="fPhoto" accept="image/*" style="display:none"></label>
      ${ed.photo ? '<button class="btn sm ghost" id="fPhotoDel">Remove photo</button>' : ''}</div></div>
    <label>Or pick an icon</label><div class="emogrid" id="fEmo">${EMOJIS.map(e => `<button class="${ed.emoji === e ? 'on' : ''}" data-e="${e}">${e}</button>`).join('')}</div>
    <div class="g3"><div><label>Meal</label><select id="fCat">${CATS.slice(1).map(c => `<option ${ed.cat === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
      <div><label>Difficulty</label><select id="fDiff">${['Easy', 'Medium', 'Difficult'].map(c => `<option ${ed.diff === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
      <div><label>Minutes</label><input id="fMins" type="number" inputmode="numeric" value="${ed.mins}"></div></div>
    <div class="g2"><div><label>Servings</label><input id="fServ" type="number" inputmode="numeric" value="${ed.serves}"></div>
      <div><label>Cuisine</label><input id="fCui" value="${esc(ed.cui)}" placeholder="Mexican"></div></div>
    <label>Ingredients</label><div id="fIng">${ed.ing.map((i, k) => `<div class="irow">
      <input class="iq" inputmode="decimal" placeholder="Qty" value="${esc(qtyStr(i.q))}">
      <select class="iu">${UNITS.map(u => `<option value="${u}" ${i.u === u ? 'selected' : ''}>${UNIT_LBL[u] ?? u}</option>`).join('')}</select>
      <input class="in" list="dlIng" placeholder="Ingredient" value="${esc(i.n)}" autocapitalize="none">
      <button class="del" data-di="${k}">✕</button>
      <input class="inote note" placeholder="Note (e.g. diced, optional)" value="${esc(i.note || '')}"></div>`).join('')}</div>
    <button class="btn sm ghost" id="fAddI">+ Add ingredient</button>
    <label id="fToolsL">Tools & appliances needed (${ed.tools.length})</label>
    <div class="toolpick" id="fTools">${[...tg].map(([g, items]) => `<h5>${TG_EMO[g] || '🔧'} ${esc(g)}</h5><div class="items">${items.map(t => `<button class="item ${ed.tools.includes(t.n) ? 'on' : ''}" style="text-transform:none;font-size:13px" data-tool="${esc(t.n)}">${esc(t.n)}</button>`).join('')}</div>`).join('')}</div>
    <label>Steps</label><div id="fSteps">${ed.steps.map((s, k) => `<div class="srow"><div class="n">${k + 1}</div><textarea placeholder="Describe this step… (e.g. Bake at 350°F for 20 minutes)">${esc(s)}</textarea><button class="del" data-ds="${k}">✕</button></div>`).join('')}</div>
    <button class="btn sm ghost" id="fAddS">+ Add step</button>
    <label>Tags (comma separated)</label><input id="fTags" value="${esc((ed.tags || []).join(', '))}" placeholder="family, spicy, quick">
    <div style="height:20px"></div><button class="btn" style="width:100%" id="fSave2">💾 Save Recipe</button></div>`;
}
$('#eBody').addEventListener('click', e => {
  const t = e.target;
  const em = t.closest('[data-e]'); if (em) { e.preventDefault(); syncEd(); ed.emoji = em.dataset.e; delete ed.photo; delete ed.img; drawEditor(); Snd.chop(); return; }
  const tl = t.closest('[data-tool]'); if (tl) { e.preventDefault(); const n = tl.dataset.tool; ed.tools.includes(n) ? ed.tools.splice(ed.tools.indexOf(n), 1) : ed.tools.push(n); tl.classList.toggle('on'); $('#fToolsL').textContent = `Tools & appliances needed (${ed.tools.length})`; Snd.chop(); return; }
  if (t.closest('#fAddI')) { syncEd(); ed.ing.push({ q: null, u: '', n: '' }); drawEditor(); const l = $$('.irow .iq'); l[l.length - 1].focus(); return; }
  if (t.closest('#fAddS')) { syncEd(); ed.steps.push(''); drawEditor(); const l = $$('.srow textarea'); l[l.length - 1].focus(); return; }
  const di = t.closest('[data-di]'); if (di) { syncEd(); ed.ing.splice(+di.dataset.di, 1); drawEditor(); return; }
  const ds = t.closest('[data-ds]'); if (ds) { syncEd(); ed.steps.splice(+ds.dataset.ds, 1); drawEditor(); return; }
  if (t.closest('#fSave2')) saveEditor();
  if (t.closest('#fPhotoDel')) { syncEd(); delete ed.photo; drawEditor(); }
});
$('#eBody').addEventListener('change', e => {
  if (e.target.id !== 'fPhoto' || !e.target.files[0]) return;
  syncEd(); const f = e.target.files[0]; const url = URL.createObjectURL(f); const im = new Image();
  im.onload = () => {
    const S = 480, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
    const m = Math.min(im.width, im.height); x.drawImage(im, (im.width - m) / 2, (im.height - m) / 2, m, m, 0, 0, S, S);
    ed.photo = c.toDataURL('image/jpeg', .78); URL.revokeObjectURL(url); drawEditor(); Snd.bubble();
  };
  im.onerror = () => toast('Could not read that photo'); im.src = url;
});
$('#eSave').onclick = saveEditor;
function saveEditor() {
  syncEd();
  ed.ing = ed.ing.filter(i => i.n); ed.steps = ed.steps.map(s => s.trim()).filter(Boolean);
  if (!ed.name.trim()) return toast('Give your recipe a name, Chef!');
  if (!ed.ing.length) return toast('Add at least one ingredient');
  if (!ed.steps.length) return toast('Add at least one step');
  ed.ing.forEach(i => { if (!i.note) delete i.note; if (!allPantry().some(p => p.n === pkey(i.n))) st.myIng.push({ n: i.n }); });
  save.myIng(); refreshDatalist();
  const rec = { id: ed.isNew ? 'c' + Date.now() : ed.id, name: ed.name.trim(), cat: ed.cat, diff: ed.diff, mins: ed.mins, serves: ed.serves, cui: ed.cui, emoji: ed.emoji, photo: ed.photo, img: ed.img, ing: ed.ing, tools: ed.tools, steps: ed.steps, tags: ed.tags, mine: 1 };
  const ix = st.custom.findIndex(x => x.id === rec.id);
  ix > -1 ? st.custom[ix] = rec : st.custom.push(rec);
  save.custom(); Snd.ding(); toast('💾 Saved! Yes, Chef!');
  closeSheet('editor'); render();
  if ($('#detail').classList.contains('open') || ed.isNew) { cur = null; openRecipe(rec.id); }
}

/* ================= SETTINGS ================= */
$('#btnSettings').onclick = () => { drawSettings(); openSheet('settings'); Snd.whoosh(); };
$('#btnNew').onclick = () => openEditor(null);
function drawSettings() {
  const b = $('#sBody');
  b.innerHTML = `<div class="dpad">
    <h2 class="sec">⚖️ Units</h2><div class="panel"><div class="units">
      <div class="ul">Volume ${seg('vol', [['us', 'Cups/Tbsp'], ['floz', 'fl oz'], ['metric', 'ml/L']])}</div>
      <div class="ul">Weight ${seg('wt', [['us', 'oz/lb'], ['metric', 'g/kg']])}</div>
      <div class="ul">Temperature ${seg('temp', [['F', '°F'], ['C', '°C']])}</div></div></div>
    <h2 class="sec">🎛️ Preferences</h2>
    <div class="list-set">
      <div class="li"><div>Sounds<small>Subtle sizzles, chops & bubbles</small></div><button class="tog ${st.set.sound ? 'on' : ''}" data-st="sound"><span class="sw"></span></button></div>
      <div class="li"><div>Assume staples<small>Salt, pepper, water & ice always count as “have”</small></div><button class="tog ${st.set.staples ? 'on' : ''}" data-st="staples"><span class="sw"></span></button></div>
    </div>
    <h2 class="sec">💾 Backup</h2>
    <div class="sub">Your data lives on this device. Export a backup before clearing Safari data, then import it to restore everything.</div>
    <div class="list-set">
      <div class="li"><div>Export backup<small>Pantry, kitchen, favorites, my recipes, settings</small></div><button class="btn sm" id="sExp">Export</button></div>
      <div class="li"><div>Import backup<small>Restore from a Yes, Chef .json file</small></div><label class="btn sm steel">Import<input type="file" id="sImp" accept=".json,application/json" style="display:none"></label></div>
      <div class="li"><div>Reset everything<small>Clears pantry, kitchen, favorites & my recipes</small></div><button class="btn sm ghost" id="sReset">Reset</button></div>
    </div>
    <div class="sub" style="text-align:center;margin-top:20px">Yes, Chef! v1.0 · ${D.recipes.length} built-in recipes · ${D.pantry.length} ingredients · ${D.tools.length} kitchen items<br>Works offline 🔥</div></div>`;
}
$('#sBody').addEventListener('click', async e => {
  const t = e.target;
  const sg = t.closest('[data-seg] button'); if (sg) { st.set[sg.parentNode.dataset.seg] = sg.dataset.v; save.set(); Snd.chop(); drawSettings(); return; }
  const tg = t.closest('[data-st]'); if (tg) { const k = tg.dataset.st; st.set[k] = !st.set[k]; save.set(); drawSettings(); Snd.chop(); return; }
  if (t.closest('#sExp')) {
    const data = { app: 'yes-chef', v: 1, at: new Date().toISOString(), pantry: [...st.pantry], tools: [...st.tools], favs: [...st.favs], log: st.log, custom: st.custom, myIng: st.myIng, myTools: st.myTools, settings: st.set };
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
    const name = 'yes-chef-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    const file = new File([blob], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: 'Yes, Chef backup' }); return; } catch (err) { if (err.name === 'AbortError') return; } }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); toast('💾 Backup exported');
    return;
  }
  if (t.closest('#sReset')) {
    modal(`<h3 style="margin-top:0">Reset everything?</h3><p style="color:var(--muted)">Pantry, kitchen, favorites and your recipes will be erased.</p><div class="row" style="justify-content:center"><button class="btn ghost" data-mclose>Cancel</button><button class="btn" id="mReset">Reset</button></div>`);
    $('#mReset').onclick = () => { ['pantry', 'tools', 'favs', 'log', 'custom', 'myIng', 'myTools', 'settings'].forEach(k => localStorage.removeItem('yc_' + k)); location.reload(); };
  }
});
$('#sBody').addEventListener('change', e => {
  if (e.target.id !== 'sImp') return; const f = e.target.files[0]; if (!f) return;
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const d = JSON.parse(rd.result); if (d.app !== 'yes-chef') throw 0;
      st.pantry = new Set(d.pantry || []); st.tools = new Set(d.tools || []); st.favs = new Set(d.favs || []);
      st.custom = d.custom || []; st.log = d.log || {}; st.myIng = d.myIng || []; st.myTools = d.myTools || []; st.set = Object.assign(st.set, d.settings || {});
      Object.values(save).forEach(fn => fn()); refreshDatalist(); drawSettings(); render(); Snd.ding(); toast('✅ Backup restored');
    } catch (err) { toast('⚠️ That file isn\'t a Yes, Chef backup'); }
  };
  rd.readAsText(f);
});

/* ================= INIT ================= */
function fitScreen() {
  // iOS home-screen apps can report a viewport shorter than the screen, leaving a dead band at the bottom.
  const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  let gap = 0;
  if (standalone && innerHeight < innerWidth === false) gap = Math.max(0, Math.round(screen.height - innerHeight));
  if (gap > 140) gap = 0;
  document.documentElement.style.setProperty('--gap', gap + 'px');
}
fitScreen(); addEventListener('resize', fitScreen); addEventListener('orientationchange', () => setTimeout(fitScreen, 300));
function refreshDatalist() { $('#dlIng').innerHTML = allPantry().map(p => `<option value="${esc(p.n)}">`).join(''); }
refreshDatalist();
render();
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
try { screen.orientation && screen.orientation.lock && screen.orientation.lock('portrait').catch(() => {}); } catch (e) {}
})();

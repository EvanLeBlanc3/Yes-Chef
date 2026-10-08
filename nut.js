/* shared nutrition estimator (also used in app.js) */
function ycNutrition(D, r) {
  const T = D.nut, CUP = 236.588;
  const look = n => T[n] || (D.aliases[n] && T[D.aliases[n]]) || (D.spiceHints.some(h => n.includes(h)) ? D.spice : null);
  const per = { tsp: 1/48, tbsp: 1/16, cup: 1, floz: 1/8, pint: 2, quart: 4 };
  let tot = { cal: 0, p: 0, c: 0, f: 0 }, known = 0, counted = 0, unknown = [];
  for (const i of r.ing) {
    if (i.q == null || /optional/i.test(i.note || '')) continue;
    const n = String(i.n).toLowerCase().trim(); counted++;
    const v = look(n); if (!v) { unknown.push(n); continue; }
    const [k, P, C, F, cup, each] = v; let g = null; const u = i.u || '';
    if (per[u] != null) g = i.q * per[u] * (cup || 240);
    else if (u === 'ml') g = i.q / CUP * (cup || 240);
    else if (u === 'l') g = i.q * 1000 / CUP * (cup || 240);
    else if (u === 'oz') g = i.q * 28.35; else if (u === 'lb') g = i.q * 453.6;
    else if (u === 'g') g = i.q; else if (u === 'kg') g = i.q * 1000;
    else if (u === 'pinch') g = i.q * .4; else if (u === 'dash') g = i.q * .6;
    else if (u === 'clove') g = i.q * 5; else if (u === 'sprig') g = i.q * 1;
    else if (u === 'stick') g = i.q * (each || 113);
    else if (u === 'bunch') g = i.q * (each || 50);
    else if (each) g = i.q * each;
    if (g == null) { unknown.push(n); continue; }
    if (u === 'slice' && each > 100) g = i.q * 35;
    const note = String(i.note || '').toLowerCase();
    const isFat = /oil|lard|shortening/.test(n) && k > 800;
    if (isFat && (/fry|frying/.test(note) || g >= 200)) g *= .12;          // deep-fry oil: only a little is absorbed
    else if (/dredg|coating|for rolling|for dusting|for topping|for dipping|for serving/.test(note) && g > 60) g *= .4;
    known++; tot.cal += g * k / 100; tot.p += g * P / 100; tot.c += g * C / 100; tot.f += g * F / 100;
  }
  const s = Math.max(1, r.serves);
  return { cal: tot.cal / s, p: tot.p / s, c: tot.c / s, f: tot.f / s, coverage: counted ? known / counted : 1, unknown };
}
if (typeof module !== 'undefined') module.exports = ycNutrition;

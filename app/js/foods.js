// Food search over a bundled subset of USDA FoodData Central (SR Legacy,
// public domain / CC0). Loaded on first use so it doesn't slow app start.
let db = null;
let loading = null;

export function loadFoods() {
  if (db) return Promise.resolve(db);
  if (!loading) {
    loading = fetch('data/foods-usda-sr.json')
      .then((r) => { if (!r.ok) throw new Error('food data unavailable'); return r.json(); })
      .then((j) => {
        db = { meta: { source: j.source, url: j.url, licence: j.licence }, foods: j.foods.map((f) => ({ name: f[0], kcal: f[1], protein: f[2], carbs: f[3], fat: f[4], portion: f[5], portionG: f[6], fdcId: f[7], key: f[0].toLowerCase() })) };
        return db;
      })
      .catch((e) => { loading = null; throw e; });
  }
  return loading;
}

export function searchFoods(query, limit = 30) {
  if (!db) return [];
  const tokens = query.toLowerCase().split(/[\s,]+/).filter((t) => t.length > 1);
  if (!tokens.length) return [];
  const out = [];
  for (const f of db.foods) {
    if (!tokens.every((t) => f.key.includes(t))) continue;
    const first = f.key.split(',')[0];
    let score = 0;
    if (f.key.startsWith(tokens[0])) score -= 30;
    if (first.includes(tokens[0])) score -= 15;
    if (f.key.includes('raw')) score -= 4;
    score += (f.key.match(/,/g) || []).length * 3 + f.key.length / 20;
    out.push([score, f]);
  }
  out.sort((a, b) => a[0] - b[0]);
  return out.slice(0, limit).map((x) => x[1]);
}

export function forGrams(f, g) {
  const k = g / 100;
  return { kcal: Math.round(f.kcal * k), protein: Math.round(f.protein * k * 10) / 10, carbs: Math.round(f.carbs * k * 10) / 10, fat: Math.round(f.fat * k * 10) / 10 };
}

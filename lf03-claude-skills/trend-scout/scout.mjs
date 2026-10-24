#!/usr/bin/env node
// Trend Scout: find videos in your niche that are beating their own channel's normal views.
// No dependencies. Needs Node 18+ and a free YouTube Data API key in the YOUTUBE_API_KEY environment variable.
//
//   node scout.mjs "claude skills" "ai for small business"            → trend-scout-YYYY-MM-DD.md
//   node scout.mjs --days 30 --min-views 5000 --format long --lang en "claude"  (format: any | long | short; --lang "" = any language)
//   --min-baseline 1000: skip channels that usually get fewer views than this (tiny channels make huge, meaningless multiples)
//
// "Outlier" = this video's views ÷ the median views of that channel's other recent videos.
// 3× means the video did three times better than that channel usually does: the idea worked, not just the channel.
// Quota: about 100 units per search phrase + a few for stats. The free daily quota is 10,000 units.
import fs from 'fs';

const API = 'https://www.googleapis.com/youtube/v3';
export const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0; };
export const iso = d => { const m = /P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(d || '') || []; return (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0); };
const chunks = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const fmt = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'K' : String(n);

// pure: score candidates against each channel's baseline (only videos ≥7 days old count toward the baseline)
export function score(candidates, recentByChannel, { now = Date.now(), minViews = 10000, minSamples = 5, minBaseline = 1000 } = {}) {
  const out = [];
  for (const v of candidates) {
    const isShort = x => (x.seconds || 0) <= 180; // compare long videos with long videos and Shorts with Shorts, or Shorts drag a channel's baseline down
    const others = (recentByChannel[v.channelId] || []).filter(o => o.id !== v.id && now - Date.parse(o.published) >= 7 * 864e5 && isShort(o) === isShort(v)).map(o => o.views);
    if (v.views < minViews || others.length < minSamples) continue;
    const base = median(others); if (!base || base < minBaseline) continue;
    out.push({ ...v, baseline: base, outlier: +(v.views / base).toFixed(1), days: Math.max(1, Math.round((now - Date.parse(v.published)) / 864e5)) });
  }
  return out.sort((a, b) => b.outlier - a.outlier);
}

// pure: markdown report
export function report(rows, { phrases, day, units, threshold = 3 }) {
  const hot = rows.filter(r => r.outlier >= threshold);
  const line = r => `| ${r.outlier}× | ${fmt(r.views)} | ${fmt(r.baseline)} | ${r.days} | [${r.title.replace(/\|/g, '/')}](https://www.youtube.com/watch?v=${r.id}) | ${r.channel} |`;
  const head = '| Outlier | Views | Channel usually gets | Days old | Video | Channel |\n|---|---|---|---|---|---|\n';
  return `# Trend Scout: ${day}\n\nSearched: ${phrases.map(p => `"${p}"`).join(', ')}. Quota used: about ${units} units.\n\n` +
    `## Beating their channel by ${threshold}× or more (${hot.length})\n\n${hot.length ? head + hot.map(line).join('\n') : '_Nothing this time. Try a longer --days window or broader phrases._'}\n\n` +
    `## Everything else that qualified (${rows.length - hot.length})\n\n${rows.length > hot.length ? head + rows.filter(r => r.outlier < threshold).slice(0, 20).map(line).join('\n') : '_None._'}\n\n` +
    `---\nHow to read this: a high outlier means the topic or packaging worked, not just the channel's size. Open the top few, note the title pattern and the first 10 seconds, then decide yourself. This list is a starting point, not an answer.\n`;
}

export async function scout(phrases, { get, days = 14, minViews = 10000, minBaseline = 1000, format = 'any', lang = 'en', now = Date.now() } = {}) {
  let units = 0; const call = async (ep, q, cost = 1) => { units += cost; return get(ep, q); };
  const after = new Date(now - days * 864e5).toISOString();
  const ids = new Set();
  for (const q of phrases) {
    const j = await call('search', { part: 'id', type: 'video', q, order: 'viewCount', publishedAfter: after, maxResults: 25, ...(lang ? { relevanceLanguage: lang } : {}), ...(format !== 'any' ? { videoDuration: format === 'short' ? 'short' : 'medium' } : {}) }, 100);
    for (const it of j.items || []) ids.add(it.id.videoId);
  }
  const videos = async list => { const res = []; for (const c of chunks([...new Set(list)], 50)) { const j = await call('videos', { part: 'snippet,statistics,contentDetails', id: c.join(','), maxResults: 50 });
    for (const v of j.items || []) res.push({ id: v.id, title: v.snippet.title, channelId: v.snippet.channelId, channel: v.snippet.channelTitle, published: v.snippet.publishedAt, seconds: iso(v.contentDetails.duration), views: +v.statistics.viewCount || 0 }); } return res; };
  const cands = await videos([...ids]);
  const channels = [...new Set(cands.map(v => v.channelId))], recent = {};
  for (const c of chunks(channels, 50)) { const j = await call('channels', { part: 'contentDetails', id: c.join(','), maxResults: 50 });
    for (const ch of j.items || []) { const pl = await call('playlistItems', { part: 'contentDetails', playlistId: ch.contentDetails.relatedPlaylists.uploads, maxResults: 30 });
      recent[ch.id] = await videos((pl.items || []).map(i => i.contentDetails.videoId)); } }
  return { rows: score(cands, recent, { now, minViews, minBaseline }), units };
}

async function main() {
  const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
  const days = +opt('--days', 14), minViews = +opt('--min-views', 10000), minBaseline = +opt('--min-baseline', 1000), format = opt('--format', 'any'), lang = opt('--lang', 'en');
  const phrases = args.filter(a => !a.startsWith('--'));
  const key = process.env.YOUTUBE_API_KEY;
  if (!phrases.length) { console.error('usage: node scout.mjs [--days 14] [--min-views 10000] [--min-baseline 1000] [--format any|long|short] [--lang en] "phrase" ["phrase" …]'); process.exit(2); }
  if (!key) { console.error('Set YOUTUBE_API_KEY first (see README.md: how to get a free key in about 5 minutes).'); process.exit(2); }
  const get = async (ep, q) => { const u = new URL(`${API}/${ep}`); for (const [k, v] of Object.entries({ ...q, key })) u.searchParams.set(k, v);
    const r = await fetch(u); const j = await r.json(); if (!r.ok) throw new Error(`${ep}: ${j.error?.message || r.status}`); return j; };
  const day = new Date().toISOString().slice(0, 10);
  const { rows, units } = await scout(phrases, { get, days, minViews, minBaseline, format, lang });
  const out = `trend-scout-${day}.md`; fs.writeFileSync(out, report(rows, { phrases, day, units }));
  console.log(`wrote ${out}: ${rows.filter(r => r.outlier >= 3).length} videos at 3× or more, ${rows.length} scored, about ${units} quota units`);
}
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) await main();

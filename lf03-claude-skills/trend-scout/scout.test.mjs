// node scout.test.mjs: offline tests (no API calls, no key needed)
import assert from 'assert';
import { score, report, median, iso, scout } from './scout.mjs';

const now = Date.parse('2026-10-24T00:00:00Z'), daysAgo = d => new Date(now - d * 864e5).toISOString();
assert.equal(median([3, 1, 2]), 2); assert.equal(median([1, 2, 3, 4]), 2.5); assert.equal(iso('PT1H2M3S'), 3723);

// channel A usually gets ~10K; one new video got 60K → 6×. Channel B has too few old videos → skipped.
const recent = {
  A: [...[9, 10, 11, 10, 12].map((k, i) => ({ id: 'a' + i, views: k * 1000, seconds: 600, published: daysAgo(10 + i) })), { id: 'hot', views: 60000, seconds: 600, published: daysAgo(2) }],
  B: [{ id: 'b0', views: 5000, published: daysAgo(20) }],
};
const cands = [{ id: 'hot', channelId: 'A', title: 'Hot | one', channel: 'A', views: 60000, seconds: 600, published: daysAgo(2) }, { id: 'b1', channelId: 'B', title: 'B', channel: 'B', views: 50000, published: daysAgo(3) }];
const rows = score(cands, recent, { now });
assert.equal(rows.length, 1); assert.equal(rows[0].outlier, 6); assert.equal(rows[0].baseline, 10000); assert.equal(rows[0].days, 2);

// young videos (<7 days) don't count toward the baseline
const r2 = score(cands, { A: [...recent.A, { id: 'y', views: 1, published: daysAgo(1) }] }, { now });
assert.equal(r2[0].baseline, 10000);

const md = report(rows, { phrases: ['claude'], day: '2026-10-24', units: 104 });
assert.ok(md.includes('| 6× | 60K | 10K | 2 |')); assert.ok(md.includes('Hot / one'), 'pipes in titles are escaped');

// end-to-end with a fake API
const fake = async (ep, q) => {
  if (ep === 'search') return { items: [{ id: { videoId: 'hot' } }] };
  if (ep === 'channels') return { items: [{ id: 'A', contentDetails: { relatedPlaylists: { uploads: 'UU_A' } } }] };
  if (ep === 'playlistItems') return { items: recent.A.map(v => ({ contentDetails: { videoId: v.id } })) };
  if (ep === 'videos') return { items: q.id.split(',').map(id => { const v = recent.A.find(x => x.id === id); return { id, snippet: { title: id, channelId: 'A', channelTitle: 'A', publishedAt: v.published }, statistics: { viewCount: String(v.views) }, contentDetails: { duration: 'PT10M' } }; }) };
};
const res = await scout(['claude'], { get: fake, now });
assert.equal(res.rows[0].id, 'hot'); assert.equal(res.rows[0].outlier, 6); assert.ok(res.units >= 100);
// Shorts on the same channel don't count toward a long video's baseline
const withShorts = { A: [...recent.A, ...[1, 2, 3, 4, 5, 6].map(i => ({ id: 's' + i, views: 300, seconds: 40, published: daysAgo(9 + i) }))] };
assert.equal(score(cands, withShorts, { now })[0].baseline, 10000);
// tiny channels (usually < minBaseline views) are skipped
assert.equal(score(cands, recent, { now, minBaseline: 20000 }).length, 0, 'baseline 10K is under a 20K floor');
console.log('trend-scout tests: all passed');

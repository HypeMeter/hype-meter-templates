// node record.test.mjs — offline, no browser.
import assert from 'node:assert/strict';
import { plan, planDemo } from './record.mjs';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok', name); };
const ctl = [{ i: 0, tag: 'INPUT', id: 'a', min: '0', max: '10', step: '1', value: '5' }, { i: 1, tag: 'SELECT', id: 's', options: ['x', 'y'], value: 'x' }, { i: 2, tag: 'BUTTON', id: 'b' }];
t('default plan sweeps range to max and restores', () => { const f = plan(ctl, { fps: 10 }); const vals = f.map(x => x[0]).filter(v => v !== undefined); assert.equal(vals[0], '0'); assert.ok(vals.includes('10')); assert.equal(vals.at(-1), '5'); });
t('default plan cycles select and clicks button', () => { const f = plan(ctl, { fps: 10 }); assert.deepEqual(f.map(x => x[1]).filter(Boolean), ['x', 'y', 'x']); assert.equal(f.filter(x => x[2] === 'click').length, 1); });
t('demo sets then sweeps by id', () => { const f = planDemo([{ set: { s: 'y' }, sweep: { a: [0, 10] }, seconds: 1 }], ['a', 's', 'b'], { fps: 10, hold: 0 }); assert.equal(f.length, 10); assert.equal(f[0][1], 'y'); assert.equal(f[0][0], '0'); assert.equal(f.at(-1)[0], '10'); });
t('demo unknown id throws', () => assert.throws(() => planDemo([{ sweep: { nope: [0, 1] } }], ['a'], { fps: 10 }), /no control with id "nope"/));
t('demo hold frames before and after', () => { const f = planDemo([{ seconds: 0.1 }], ['a'], { fps: 10, hold: 1 }); assert.equal(f.length, 21); });
console.log(`${n} passed`);

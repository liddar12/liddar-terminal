import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildScannerPrompt,
  horizonSeconds,
  keepQuoted,
  parseIdeasJson,
  stockLines,
} from '../src/scannerPrompt.js';
import { quoteFromChart, trendOf } from '../api/quotes.js';

const QUOTES = {
  SPY: { c: 580.25, d: 2.9, dp: 0.5, trend: 'up' },
  NVDA: { c: 169.04, d: -3.1, dp: -1.8, trend: 'down' },
  XOM: { c: 118.4, d: 0.6, dp: 0.51, trend: 'flat' },
};

test('prompt keeps the production structure and JSON contract', () => {
  const p = buildScannerPrompt('calls', ['NVDA', 'XOM', 'SPY'], QUOTES, '\nMarket breadth regime (RSP/SPY): breadth flat.', new Date('2026-11-10T15:00:00Z'));
  assert.match(p, /^Options analyst scan\. CALLs only\. Date: Tue November 10 2026\. Market: SPY \$580\.25 \+0\.50%\./);
  assert.match(p, /Market breadth regime \(RSP\/SPY\): breadth flat\./);
  assert.match(p, /STOCKS:\nNVDA \$169\.04 -1\.80% trend:down\nXOM \$118\.40 \+0\.51% trend:flat\n/);
  assert.ok(!/^SPY \$/m.test(p.split('STOCKS:')[1]), 'SPY is the market line, not a candidate');
  assert.match(p, /Find top 5 CALL opportunities\. Focus on bullish:/);
  assert.match(p, /"riskRewardRatio":"3\.2:1"/);
  assert.match(p, /Return exactly 5 results\. Realistic strikes near current price\. Expiries 2-6 weeks out\. Not financial advice\.$/);
});

test('puts prompt uses the bearish focus', () => {
  const p = buildScannerPrompt('puts', ['NVDA'], QUOTES);
  assert.match(p, /PUTs only/);
  assert.match(p, /Focus on bearish: downtrends/);
});

test('tickers without a quote never reach the prompt', () => {
  assert.equal(stockLines(['NVDA', 'ZZZZ'], QUOTES), 'NVDA $169.04 -1.80% trend:down');
});

test('parse recovers a truncated array like the V2 scanner did', () => {
  const text = '```json\n[{"ticker":"nvda","confidence":"HIGH","strike":175,"expiry":"2026-12-18","currentPrice":169.04},{"ticker":"XOM","confidence":"low"},{"ticker":"BAD","confi';
  const ideas = parseIdeasJson(text);
  assert.equal(ideas.length, 2);
  assert.equal(ideas[0].ticker, 'NVDA');
  assert.equal(ideas[0].confidence, 'HIGH');
  assert.equal(ideas[1].confidence, 'LOW');
  assert.equal(parseIdeasJson('no json here'), null);
});

test('ideas for symbols we did not quote are dropped', () => {
  const ideas = [{ ticker: 'NVDA' }, { ticker: 'TSLA' }];
  assert.deepEqual(keepQuoted(ideas, QUOTES).map((i) => i.ticker), ['NVDA']);
});

test('horizon resolves at expiry, bounded', () => {
  const now = Date.parse('2026-11-10T15:00:00Z');
  const h = horizonSeconds({ expiry: '2026-12-18' }, now);
  assert.ok(h > 37 * 86_400 && h < 39 * 86_400);
  assert.equal(horizonSeconds({}, now), 7 * 86_400);
  assert.equal(horizonSeconds({ expiry: '2026-11-01' }, now), 86_400);
  assert.equal(horizonSeconds({ expiry: '2027-06-18' }, now), 60 * 86_400);
});

test('quote math: change vs prior close and V2 trend rule', () => {
  const closes = [100, 100, 100, 100, 101, 102, 103, 104, 105, 106]; // last bar = today
  const q = quoteFromChart({ chart: { result: [{ meta: { regularMarketPrice: 106 }, indicators: { quote: [{ close: closes }] } }] } });
  assert.equal(q.c, 106);
  assert.equal(q.d, 1);              // vs prior close 105
  assert.equal(q.trend, 'up');
  assert.equal(trendOf([100, 100, 100, 100, 100, 100, 100, 100, 100, 100]), 'flat');
  assert.throws(() => quoteFromChart({ chart: { result: [{}] } }));
});

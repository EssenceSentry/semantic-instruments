import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Histogram } from '../src/components/Charts';

test('pending posterior intervals do not produce invalid SVG geometry', () => {
  const markup = renderToStaticMarkup(
    createElement(Histogram, {
      values: [],
      interval: [NaN, NaN],
      truth: NaN,
    }),
  );
  assert.ok(!markup.includes('NaN'));
  assert.ok(!markup.includes('Reference'));
});

test('a high reference value labels toward the plot interior', () => {
  const markup = renderToStaticMarkup(
    createElement(Histogram, {
      values: [0.8, 0.9, 1],
      interval: [0.8, 1],
      truth: 0.98,
    }),
  );
  assert.match(markup, /text-anchor="end"[^>]*>Reference/);
  assert.ok(!markup.includes('NaN'));
});

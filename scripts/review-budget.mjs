import { readFileSync } from 'node:fs';
import { ranking } from '../src/core/math.ts';

const manifest = JSON.parse(readFileSync(new URL('../public/data/paired/manifest.json', import.meta.url)));
const items = manifest.items.filter(item => item.split === 'holdout' && [0, 1].includes(item.label)
  && Number.isFinite(item.scores?.model) && Number.isFinite(item.scores?.image));
const order = key => ranking(items.map(item => item.scores[key]), items);
const image = order('image'), fusion = order('model');
const positives = indices => indices.reduce((n,i) => n + items[i].label, 0);
const groups = indices => new Set(indices.map(i => items[i].group)).size;
const imageTop = image.slice(0, 100), fusionTop = fusion.slice(0, 100);
const report = {
  eligible: items.length, positives: positives(image),
  budgets: [25, 50, 100, 250].map(k => ({k, image: positives(image.slice(0,k)), fusion: positives(fusion.slice(0,k))})),
  overlap: imageTop.filter(i => fusionTop.includes(i)).length,
  channels: { image: groups(imageTop), fusion: groups(fusionTop) },
  disagreements: [
    imageTop.find(i => !fusionTop.includes(i) && items[i].label === 0),
    fusionTop.find(i => !imageTop.includes(i) && items[i].label === 1),
  ].map(i => ({id: items[i].id, label: items[i].label, imageRank: image.indexOf(i)+1,
    fusionRank: fusion.indexOf(i)+1, annotations: items[i].annotations})),
};
console.log(JSON.stringify(report, null, 2));

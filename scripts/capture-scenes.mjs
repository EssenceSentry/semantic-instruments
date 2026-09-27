import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createCaptureClient } from './capture-client.mjs';
const args = process.argv.slice(2),
  file = args[0];
if (!file)
  throw new Error(
    'Usage: npm run capture -- examples/storyboards/weapons.json [--url http://127.0.0.1:8773/] [--out output/captures]',
  );
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const storyboard = JSON.parse(await readFile(file, 'utf8'));
if (storyboard.schemaVersion !== 1 || !Array.isArray(storyboard.shots))
  throw new Error('Storyboard requires schemaVersion 1 and shots.');
const output = resolve(option('--out', 'output/captures'));
const client = await createCaptureClient({
  url: option('--url', 'http://127.0.0.1:8773/'),
  ...storyboard.viewport,
});
try {
  for (const shot of storyboard.shots) {
    if (!/^[a-zA-Z0-9_-]+$/.test(shot.id))
      throw new Error('Shot IDs may contain letters, digits, hyphens and underscores.');
    if (shot.timeline) {
      await client.call('loadTimeline', shot.timeline);
      if (!Array.isArray(shot.times) || !shot.times.length)
        throw new Error('Timeline shot requires times.');
      for (let frame = 0; frame < shot.times.length; frame++) {
        await client.call('seek', shot.times[frame]);
        const path = resolve(output, `${shot.id}-${String(frame).padStart(5, '0')}.png`);
        await client.capture(path, { component: shot.component, background: shot.background });
        console.log(`${shot.id} · t=${shot.times[frame]} · ${path}`);
      }
    } else {
      const path = resolve(output, shot.id + '.png');
      await client.render(shot.scene, path, {
        component: shot.component,
        background: shot.background,
      });
      console.log(`${shot.id} · ${path}`);
    }
  }
} finally {
  await client.close();
}

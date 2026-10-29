import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import app from '../src/app.js';
let server, base, image;
before(async () => {
  process.env.IMAGE_PROVIDER = 'demo';
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  base = `http://127.0.0.1:${server.address().port}`;
  image = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#d18559' } }).png().toBuffer();
});
after(() => new Promise(resolve => server.close(resolve)));
function body({ bytes = image, type = 'image/png', style = 'caricature', prompt = '' } = {}) {
  const data = new FormData();
  data.append('image', new Blob([bytes], { type }), 'photo.png');
  data.append('style', style); data.append('prompt', prompt);
  return data;
}
test('health, config and front-end are served without exposing private files', async () => {
  assert.equal((await (await fetch(`${base}/api/health`)).json()).status, 'ok');
  assert.equal((await (await fetch(`${base}/api/config`)).json()).maxUploadBytes, 4 * 1024 * 1024);
  assert.match(await (await fetch(base)).text(), /무드픽/);
  for (const path of ['/.env', '/package.json', '/src/app.js', '/api/missing']) assert.equal((await fetch(base + path)).status, 404);
});
test('all four styles return decodable PNG files', async () => {
  for (const style of ['caricature', 'animation', 'poster', 'sketch']) {
    const res = await fetch(`${base}/api/transform`, { method: 'POST', body: body({ style }) });
    assert.equal(res.status, 200); assert.match(res.headers.get('content-type'), /image\/png/);
    assert.equal(res.headers.get('x-image-provider'), 'demo');
    const bytes = Buffer.from(await res.arrayBuffer());
    assert.equal((await sharp(bytes).metadata()).format, 'png');
    assert.notDeepEqual(bytes, image);
  }
});
test('missing file, invalid style, prompt, spoofed content and oversized uploads are rejected', async () => {
  const cases = [
    [new FormData(), 400], [body({ style: 'bad' }), 400],
    [body({ prompt: 'a'.repeat(501) }), 400],
    [body({ type: 'text/plain' }), 415],
    [body({ bytes: Buffer.from('not an image') }), 415],
    [body({ bytes: Buffer.alloc(4 * 1024 * 1024 + 1) }), 413]
  ];
  for (const [data, status] of cases) {
    const res = await fetch(`${base}/api/transform`, { method: 'POST', body: data });
    assert.equal(res.status, status); assert.equal(typeof (await res.json()).error, 'string');
  }
});
test('missing OpenAI key is reported without calling the provider', async () => {
  const saved = process.env.OPENAI_API_KEY;
  process.env.IMAGE_PROVIDER = 'openai';
  delete process.env.OPENAI_API_KEY;
  try {
    const res = await fetch(`${base}/api/transform`, { method: 'POST', body: body() });
    assert.equal(res.status, 503);
    assert.match((await res.json()).error, /OPENAI_API_KEY/);
  } finally {
    if (saved === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = saved;
    process.env.IMAGE_PROVIDER = 'demo';
  }
});

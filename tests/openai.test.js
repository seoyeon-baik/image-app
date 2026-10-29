import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import sharp from 'sharp';
import { transformWithOpenAI, IMAGE_MODEL } from '../src/services/openai.js';
import { createApp } from '../src/app.js';

let input, output, savedKey;
before(async () => {
  savedKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'unit-test-placeholder';
  input = await sharp({ create: { width: 24, height: 24, channels: 3, background: '#ff0000' } }).png().toBuffer();
  output = await sharp({ create: { width: 24, height: 24, channels: 3, background: '#0000ff' } }).png().toBuffer();
});
after(() => {
  if (savedKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = savedKey;
});
const success = () => Response.json({ data: [{ b64_json: output.toString('base64') }] });

test('exact Sunburst model, original photo, style and extra prompt follow the documented edit request', async () => {
  const seen = [];
  for (const style of ['caricature', 'animation', 'poster', 'sketch']) {
    const result = await transformWithOpenAI({ buffer: input, style, prompt: '따뜻한 색감' }, {
      fetchImpl: async (url, options) => {
        assert.equal(url, 'https://api.openai.com/v1/images/edits');
        assert.equal(options.method, 'POST');
        assert.equal(options.headers.Authorization, 'Bearer unit-test-placeholder');
        const body = JSON.parse(options.body);
        assert.equal(body.model, 'gpt-image-2.5-sunburst');
        assert.equal(body.output_format, 'png');
        assert.equal(body.n, 1);
        assert.equal(body.images[0].image_url, `data:image/png;base64,${input.toString('base64')}`);
        assert.match(body.prompt, /따뜻한 색감/);
        assert.ok(!('response_format' in body));
        assert.ok(!('input_fidelity' in body));
        seen.push(body.prompt);
        return success();
      }
    });
    assert.equal(result.contentType, 'image/png');
    assert.equal(result.provider, 'openai');
    assert.deepEqual(await sharp(result.buffer).raw().toBuffer(), await sharp(output).raw().toBuffer());
  }
  assert.equal(new Set(seen).size, 4);
});

test('authentication, access, quota, policy, upstream and network errors use safe user messages', async () => {
  const cases = [[401, '', 503], [403, '', 503], [404, 'model_not_found', 503], [429, 'insufficient_quota', 429], [429, '', 429], [400, 'content_policy_violation', 422], [400, '', 422], [500, '', 502]];
  for (const [status, code, expected] of cases) {
    await assert.rejects(transformWithOpenAI({ buffer: input, style: 'caricature' }, {
      fetchImpl: async () => Response.json({ error: { code, message: 'unit-test-placeholder secret upstream detail' } }, { status })
    }), error => error.status === expected && !error.message.includes('unit-test-placeholder') && !error.message.includes('upstream detail'));
  }
  await assert.rejects(transformWithOpenAI({ buffer: input, style: 'caricature' }, {
    fetchImpl: async () => { throw new Error('unit-test-placeholder'); }
  }), error => error.status === 502 && !error.message.includes('unit-test-placeholder'));
});

test('timeouts and missing or invalid image responses fail cleanly', async () => {
  await assert.rejects(transformWithOpenAI({ buffer: input, style: 'poster' }, {
    timeoutMs: 5,
    fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason)))
  }), error => error.status === 504);
  for (const data of [{}, { data: [{ b64_json: 'bad!' }] }, { data: [{ b64_json: Buffer.from('not an image').toString('base64') }] }]) {
    await assert.rejects(transformWithOpenAI({ buffer: input, style: 'animation' }, {
      fetchImpl: async () => Response.json(data)
    }), error => error.status === 502);
  }
});

test('multipart upload goes through Express and mocked OpenAI and returns a downloadable image', async () => {
  const app = createApp({ transform: args => transformWithOpenAI(args, { fetchImpl: async () => success() }) });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const data = new FormData();
    data.append('image', new Blob([input], { type: 'image/png' }), 'original.png');
    data.append('style', 'animation');
    data.append('prompt', '따뜻한 색감');
    const res = await fetch(`${base}/api/transform`, { method: 'POST', body: data });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /image\/png/);
    assert.equal(res.headers.get('x-image-provider'), 'openai');
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.equal((await sharp(Buffer.from(await res.arrayBuffer())).metadata()).format, 'png');
    const config = await (await fetch(`${base}/api/config`)).json();
    assert.equal(config.model, IMAGE_MODEL);
    assert.ok(!JSON.stringify(config).includes('unit-test-placeholder'));
    for (const path of ['/.env', '/.env.local', '/src/services/openai.js']) assert.equal((await fetch(base + path)).status, 404);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

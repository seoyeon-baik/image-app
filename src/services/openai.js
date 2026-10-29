import sharp from 'sharp';
import { HttpError } from '../errors.js';

export const IMAGE_MODEL = 'gpt-image-2.5-sunburst';
const ENDPOINT = 'https://api.openai.com/v1/images/edits';
const STYLE_PROMPTS = {
  caricature: 'Create a polished, playful hand-drawn caricature. Gently exaggerate distinctive facial features and expressions while keeping the person recognizable. Use clean lines, warm colors, and a tasteful illustrated background.',
  animation: 'Transform the photo into an original animated-film illustration with expressive eyes, clean linework, soft cel shading, and rich cinematic colors. Keep the person recognizable and preserve their pose.',
  poster: 'Create a cinematic movie-poster portrait featuring the person in the photo as the protagonist. Use dramatic lighting, refined color grading, strong composition, and an atmospheric background. Preserve facial identity. Do not add credits, logos, or text unless requested.',
  sketch: 'Transform the photo into a detailed graphite pencil sketch on subtly textured white paper, with expressive linework and soft shading. Keep facial identity, pose, and composition recognizable.'
};

function upstreamError(status, code) {
  if (['moderation_blocked', 'content_policy_violation', 'safety_violations'].includes(code)) return new HttpError(422, '사진 또는 요청이 이미지 생성 정책에 의해 거절됐어요. 다른 사진이나 설명으로 시도해 주세요.');
  if (status === 401) return new HttpError(503, 'OpenAI 인증에 실패했어요. 서버의 API 키 설정을 확인해 주세요.');
  if (status === 403 || status === 404 || code === 'model_not_found') return new HttpError(503, '이 프로젝트에서 gpt-image-2.5-sunburst 모델을 사용할 수 없어요. 모델 접근 권한과 조직 인증을 확인해 주세요.');
  if (status === 429) return new HttpError(429, code === 'insufficient_quota' ? 'OpenAI API 크레딧 또는 사용 한도를 확인해 주세요.' : 'OpenAI 요청 한도에 도달했어요. 잠시 후 다시 시도해 주세요.');
  if (status === 400 || status === 422) return new HttpError(422, 'OpenAI가 이미지 편집 요청을 처리하지 못했어요. 다른 사진이나 설명으로 시도해 주세요.');
  return new HttpError(502, 'OpenAI 이미지 서비스에 오류가 발생했어요. 잠시 후 다시 시도해 주세요.');
}

// Node.js 내장 fetch 사용. 공식 Images Edit JSON 형식으로 원본 바이트를 전송합니다.
// fetchImpl 주입은 테스트용이며 실제 요청의 호스트는 ENDPOINT로 고정됩니다.
export async function transformWithOpenAI({ buffer, style, prompt = '' }, { fetchImpl = globalThis.fetch, timeoutMs = 105000 } = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey?.trim()) throw new HttpError(503, '서버에 OPENAI_API_KEY가 설정되지 않았어요.');
  if (!STYLE_PROMPTS[style]) throw new HttpError(400, '지원하는 스타일을 선택해 주세요.');
  const { format } = await sharp(buffer).metadata();
  const mime = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[format];
  if (!mime) throw new HttpError(415, '지원하지 않는 이미지 형식이에요.');
  const instruction = [
    'Edit the supplied original photo, using it as the primary visual reference. Preserve the subject identity, number of people, and recognizable features.',
    STYLE_PROMPTS[style],
    prompt ? `Additional creative preferences from the user: ${prompt}` : ''
  ].filter(Boolean).join('\n\n');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let data;
  try {
    const response = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: IMAGE_MODEL,
        images: [{ image_url: `data:${mime};base64,${buffer.toString('base64')}` }],
        prompt: instruction,
        n: 1,
        size: '1024x1024',
        quality: 'medium',
        output_format: 'png'
      }),
      signal: controller.signal
    });
    data = await response.json().catch(() => null);
    // OpenAI 원본 오류 메시지나 요청 헤더에는 민감한 정보가 있을 수 있어 반환하지 않습니다.
    if (!response.ok) throw upstreamError(response.status, data?.error?.code);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (controller.signal.aborted) throw new HttpError(504, '이미지 생성 시간이 초과됐어요. 잠시 후 다시 시도해 주세요.');
    throw new HttpError(502, 'OpenAI에 연결하지 못했어요. 서버의 네트워크 연결을 확인해 주세요.');
  } finally { clearTimeout(timer); }
  const encoded = data?.data?.[0]?.b64_json;
  if (typeof encoded !== 'string' || !encoded.length || encoded.length > 32 * 1024 * 1024 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    throw new HttpError(502, 'OpenAI 응답에 올바른 결과 이미지가 없어요.');
  }
  try {
    // 실제 이미지 디코딩 확인 및 출력 메타데이터 제거. Vercel 응답 크기를 줄입니다.
    const result = await sharp(Buffer.from(encoded, 'base64'), { limitInputPixels: 25000000 })
      .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
      .png({ compressionLevel: 9 }).toBuffer();
    return { buffer: result, contentType: 'image/png', provider: 'openai' };
  } catch { throw new HttpError(502, 'OpenAI 결과 이미지를 읽지 못했어요. 다시 시도해 주세요.'); }
}

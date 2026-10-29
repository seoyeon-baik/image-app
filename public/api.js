// 모든 변환은 같은 출처의 Express 백엔드로 요청합니다.
export const config = { mode: 'openai', endpoint: '/api/transform' };
export async function loadConfig({ signal } = {}) {
  const response = await fetch('/api/config', { signal });
  if (!response.ok) throw new Error('서버 설정을 불러오지 못했어요.');
  const data = await response.json();
  config.mode = data.provider;
  return data;
}

export async function transformImage({ file, style, prompt, signal }) {
  const body = new FormData();
  body.append('image', file);
  body.append('style', style);
  body.append('prompt', prompt);
  const response = await fetch(config.endpoint, { method: 'POST', body, signal });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `이미지 변환에 실패했어요. (${response.status})`);
  }
  if (response.headers.get('content-type')?.includes('image/')) {
    config.mode = response.headers.get('x-image-provider') || config.mode;
    return response.blob();
  }
  // 권장 응답: 이미지 바이너리. JSON 응답도 지원합니다: { imageUrl: "..." }
  const data = await response.json();
  if (!data.imageUrl) throw new Error('서버 응답에 이미지가 없어요.');
  const imageResponse = await fetch(data.imageUrl, { signal });
  if (!imageResponse.ok) throw new Error('결과 이미지를 불러오지 못했어요.');
  const blob = await imageResponse.blob();
  if (!blob.type.startsWith('image/')) throw new Error('이미지 형식의 응답이 필요해요.');
  return blob;
}

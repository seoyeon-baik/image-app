import sharp from 'sharp';
import { HttpError } from '../errors.js';

import { transformWithOpenAI } from './openai.js';

export async function transformImage({ buffer, style, prompt }) {
  const provider = process.env.IMAGE_PROVIDER || 'openai';
  if (provider === 'openai') return transformWithOpenAI({ buffer, style, prompt });
  if (provider !== 'demo') throw new HttpError(503, '서버의 이미지 변환 모드 설정을 확인해 주세요.');
  let image = sharp(buffer, { limitInputPixels: 25000000 }).rotate()
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' });
  switch (style) {
    case 'caricature': image = image.modulate({ saturation: 1.7, brightness: 1.05 }).sharpen(); break;
    case 'animation': image = image.modulate({ saturation: 1.4, brightness: 1.12 }).median(3); break;
    case 'poster': image = image.modulate({ saturation: .65, brightness: .82 }).linear(1.15, -12).tint('#8eaaa0'); break;
    case 'sketch': image = image.greyscale().normalise().sharpen(); break;
  }
  return { buffer: await image.png().toBuffer(), contentType: 'image/png', provider: 'demo' };
}

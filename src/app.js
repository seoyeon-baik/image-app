import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { HttpError } from './errors.js';
import { transformImage } from './services/transform.js';
import { IMAGE_MODEL } from './services/openai.js';

export function createApp({ transform = transformImage } = {}) {
const app = express();
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const styles = ['caricature', 'animation', 'poster', 'sketch'];
app.disable('x-powered-by');
app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 2, fieldSize: 4096, parts: 3 },
  fileFilter: (_req, file, callback) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      return callback(new HttpError(415, 'JPG, PNG 또는 WEBP 이미지만 업로드할 수 있어요.'));
    }
    callback(null, true);
  }
});
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/api/config', (_req, res) => res.json({ provider: process.env.IMAGE_PROVIDER || 'openai', model: IMAGE_MODEL, maxUploadBytes: MAX_UPLOAD_BYTES }));
app.post('/api/transform', upload.single('image'), async (req, res) => {
  if (!req.file) throw new HttpError(400, '변환할 사진을 업로드해 주세요.');
  const { style, prompt = '' } = req.body;
  if (!styles.includes(style)) throw new HttpError(400, '지원하는 스타일을 선택해 주세요.');
  if (typeof prompt !== 'string' || prompt.length > 500) throw new HttpError(400, '추가 요청은 500자 이하로 입력해 주세요.');
  if (Object.keys(req.body).some(key => !['style', 'prompt'].includes(key))) throw new HttpError(400, '허용되지 않은 입력 항목이 있어요.');
  try {
    const metadata = await sharp(req.file.buffer, { limitInputPixels: 25000000 }).metadata();
    if (!['jpeg', 'png', 'webp'].includes(metadata.format) || (metadata.pages || 1) > 1) throw new Error('format');
  } catch { throw new HttpError(415, '사진을 읽을 수 없어요. 2,500만 화소 이하의 정적인 JPG, PNG 또는 WEBP를 선택해 주세요.'); }
  const result = await transform({ buffer: req.file.buffer, style, prompt });
  // Vercel 함수 응답 크기 제한에도 여유를 둡니다.
  if (result.buffer.length > MAX_UPLOAD_BYTES) throw new HttpError(413, '결과 이미지가 너무 커요. 더 작은 사진으로 다시 시도해 주세요.');
  res.set({ 'Content-Type': result.contentType, 'X-Image-Provider': result.provider, 'X-Content-Type-Options': 'nosniff' }).send(result.buffer);
});
app.use('/api', (_req, res) => res.status(404).json({ error: '존재하지 않는 API 경로예요.' }));
// 공개 파일만 제공: .env, 서버 코드, package.json은 웹에 노출하지 않습니다.
app.use(express.static(fileURLToPath(new URL('../public/', import.meta.url)), { dotfiles: 'deny' }));
app.use((_req, res) => res.status(404).type('text').send('페이지를 찾을 수 없습니다.'));
app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) {
    const tooLarge = error.code === 'LIMIT_FILE_SIZE';
    return res.status(tooLarge ? 413 : 400).json({ error: tooLarge ? '4MB 이하의 사진을 업로드해 주세요.' : '파일은 image 필드로 한 장만, style과 prompt 항목과 함께 보내 주세요.' });
  }
  const status = error instanceof HttpError ? error.status : 500;
  res.status(status).json({ error: status === 500 ? '이미지 처리 중 오류가 발생했어요. 다른 사진으로 다시 시도해 주세요.' : error.message });
});
return app;
}
export default createApp();

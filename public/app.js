import { config, loadConfig, transformImage } from './api.js';
const $ = id => document.getElementById(id);
const names = { caricature: '캐리커처', animation: '애니메이션', poster: '영화 포스터', sketch: '연필 스케치' };
let file = null, style = 'caricature', sourceUrl = null, resultUrl = null, busy = false, resultStyle = '';
const setStatus = (message, error = false) => { $('status').textContent = message; $('status').classList.toggle('error', error); };
function clearResult() {
  if (resultUrl) URL.revokeObjectURL(resultUrl);
  resultUrl = null;
  $('comparison').hidden = true;
  $('emptyState').hidden = false;
  $('downloadButton').disabled = true;
  $('resultBadge').textContent = 'PREVIEW';
  $('resultTitle').textContent = '당신의 다음 프로필 사진, 여기서.';
  $('resultDescription').textContent = '완성된 이미지는 자유롭게 다운로드할 수 있어요.';
}
async function selectFile(candidate) {
  if (!candidate || busy) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(candidate.type)) return setStatus('JPG, PNG 또는 WEBP 이미지를 선택해 주세요.', true);
  if (candidate.size > 4 * 1024 * 1024) return setStatus('4MB 이하의 사진을 선택해 주세요.', true);
  try { const image = await createImageBitmap(candidate); image.close(); }
  catch { return setStatus('사진을 열 수 없어요. 다른 이미지를 선택해 주세요.', true); }
  if (busy) return;
  clearResult();
  if (sourceUrl) URL.revokeObjectURL(sourceUrl);
  file = candidate;
  sourceUrl = URL.createObjectURL(file);
  $('uploadPreview').src = sourceUrl;
  $('uploadPreview').hidden = false;
  $('uploadIcon').hidden = true;
  $('uploadTitle').textContent = file.name;
  $('uploadHint').textContent = '클릭해서 다른 사진 선택하기';
  $('generateButton').disabled = false;
  setStatus('사진이 준비됐어요. 원하는 스타일로 변환해 보세요.');
}
$('fileInput').addEventListener('change', event => { selectFile(event.target.files[0]); event.target.value = ''; });
for (const name of ['dragenter', 'dragover']) $('dropzone').addEventListener(name, event => { event.preventDefault(); if (!busy) $('dropzone').classList.add('dragover'); });
for (const name of ['dragleave', 'drop']) $('dropzone').addEventListener(name, event => { event.preventDefault(); $('dropzone').classList.remove('dragover'); });
$('dropzone').addEventListener('drop', event => selectFile(event.dataTransfer.files[0]));
// 드롭 영역 바깥에 파일을 놓아도 브라우저가 사진으로 이동하지 않게 합니다.
window.addEventListener('dragover', event => event.preventDefault());
window.addEventListener('drop', event => event.preventDefault());
document.querySelectorAll('.style').forEach(button => button.addEventListener('click', () => {
  if (busy) return;
  style = button.dataset.style;
  document.querySelectorAll('.style').forEach(item => { const selected = item === button; item.classList.toggle('selected', selected); item.setAttribute('aria-pressed', String(selected)); });
  if (resultUrl) setStatus('스타일을 바꿨어요. 변환 버튼을 누르면 새 결과가 만들어져요.');
}));
function setBusy(value) {
  busy = value;
  $('generateButton').disabled = value || !file;
  $('generateButton').innerHTML = value ? '이미지 변환 중…' : '<span>✦</span> 이미지 변환하기 <span>→</span>';
  $('fileInput').disabled = value;
  $('prompt').disabled = value;
  document.querySelectorAll('.style').forEach(button => button.disabled = value);
  $('resultStage').setAttribute('aria-busy', String(value));
}
$('generateButton').addEventListener('click', async () => {
  if (!file || busy) return;
  clearResult();
  setBusy(true);
  $('emptyState').hidden = true;
  $('loading').hidden = false;
  setStatus('서버에 연결하고 있어요.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);
  try {
    await loadConfig({ signal: controller.signal });
    setStatus(config.mode === 'demo' ? '서버 데모는 필터를 적용하며 추가 요청은 반영하지 않습니다.' : 'OpenAI로 이미지를 편집하고 있어요. 잠시 기다려 주세요.');
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const blob = await transformImage({ file, style, prompt: $('prompt').value.trim(), signal: controller.signal });
    if (!blob.type.startsWith('image/')) throw new Error('올바른 이미지 응답이 아니에요.');
    resultUrl = URL.createObjectURL(blob);
    $('resultImage').src = resultUrl;
    await $('resultImage').decode();
    $('originalImage').src = sourceUrl;
    resultStyle = style;
    $('comparison').hidden = false;
    $('compareSlider').value = 50;
    updateSlider();
    $('downloadButton').disabled = false;
    $('resultBadge').textContent = config.mode === 'demo' ? 'DEMO RESULT' : 'COMPLETE';
    $('resultTitle').textContent = `${names[style]} ${config.mode === 'demo' ? '데모' : '변환'} 완성`;
    $('resultDescription').textContent = '슬라이더를 좌우로 움직여 원본과 비교해 보세요.';
    setStatus(config.mode === 'demo' ? '서버 필터 데모입니다. AI 편집을 사용하려면 서버를 OpenAI 모드로 실행해 주세요.' : '이미지가 완성됐어요. 다운로드해서 저장하세요.');
  } catch (error) {
    clearResult();
    setStatus(error.name === 'AbortError' ? '요청 시간이 초과됐어요. 다시 시도해 주세요.' : error.message || '변환에 실패했어요. 다시 시도해 주세요.', true);
  } finally { clearTimeout(timeout); $('loading').hidden = true; setBusy(false); }
});
function updateSlider() {
  const value = $('compareSlider').value;
  $('originalLayer').style.clipPath = `inset(0 ${100 - value}% 0 0)`;
  $('sliderLine').style.left = `${value}%`;
  $('compareSlider').setAttribute('aria-valuetext', `원본 ${value}%, 변환 ${100 - value}%`);
}
$('compareSlider').addEventListener('input', updateSlider);
$('downloadButton').addEventListener('click', () => {
  if (!resultUrl) return;
  const link = document.createElement('a');
  link.href = resultUrl;
  // API가 PNG 이외의 이미지를 반환할 수 있으므로 결과 MIME 타입에 맞춰 저장합니다.
  fetch(resultUrl).then(response => response.blob()).then(blob => {
    const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[blob.type] || 'png';
    link.download = `moodpic-${resultStyle}-${Date.now()}.${ext}`;
    document.body.append(link); link.click(); link.remove();
  }).catch(() => setStatus('다운로드하지 못했어요. 다시 시도해 주세요.', true));
});
$('helpButton').addEventListener('click', () => $('guide').showModal());
$('closeGuide').addEventListener('click', () => $('guide').close());
$('guide').addEventListener('click', event => { if (event.target === $('guide')) { const rect = $('guide').getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) $('guide').close(); } });
window.addEventListener('beforeunload', () => { if (sourceUrl) URL.revokeObjectURL(sourceUrl); if (resultUrl) URL.revokeObjectURL(resultUrl); });

loadConfig().then(data => {
  const demo = data.provider === 'demo';
  document.querySelector('.privacy').textContent = demo ? '사진은 서버에서 필터 처리하며 파일로 보관하지 않아요' : '사진과 요청은 AI 변환을 위해 OpenAI로 전송돼요';
  $('guideNote').textContent = demo ? '현재는 서버 필터 데모입니다. 추가 요청은 반영되지 않습니다.' : '업로드한 사진과 스타일, 추가 요청을 OpenAI에 전송해 편집합니다. 이미지 생성에는 시간이 걸릴 수 있습니다.';
  document.querySelector('.demo-note').textContent = demo ? '서버 데모 모드 · AI 생성이 아닌 필터 변환' : 'OpenAI 이미지 편집 · GPT Image 2.5 Sunburst';
}).catch(() => setStatus('서버에 연결하지 못했어요. npm start로 실행했는지 확인해 주세요.', true));

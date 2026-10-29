# 무드픽 · AI 캐리커처 스튜디오

사진을 업로드하고 캐리커처·애니메이션·영화 포스터·연필 스케치 스타일로 변환하는 웹 앱입니다. 원본과 결과를 슬라이더로 비교하고 PNG로 다운로드할 수 있습니다.

HTML/CSS/JavaScript 프론트엔드와 Node.js/Express 백엔드를 사용합니다. 서버에서 OpenAI `gpt-image-2.5-sunburst` 이미지 편집 API를 호출하며 로딩 및 오류 상태를 안내합니다.

## 로컬 실행

Node.js 24를 설치하고 실행합니다.

```sh
git clone https://github.com/seoyeon-baik/image-app.git
cd image-app
npm ci
cp .env.example .env
```

`.env`에 자신의 API 키를 설정합니다. 기존 프로젝트에 `.env`가 있으면 복사하지 말고 그대로 사용하세요.

```dotenv
PORT=3000
IMAGE_PROVIDER=openai
OPENAI_API_KEY=your_api_key_here
```

```sh
npm start
```

http://localhost:3000 에 접속하세요. 중단은 `Ctrl+C`, 자동 재시작 개발 모드는 `npm run dev`, 테스트는 `npm test`입니다.
실제 이미지 생성에는 OpenAI 사용 요금과 모델 접근 권한이 필요합니다. 키 없이 필터 데모를 실행하려면 `IMAGE_PROVIDER=demo`로 설정하세요.

## 프로젝트 구조

```text
public/                  # HTML, CSS, 브라우저 JavaScript
src/app.js               # Express 앱 기본 export (Vercel 진입점)
src/index.js             # 로컬 서버 실행
src/services/openai.js   # OpenAI 이미지 편집 요청
src/services/transform.js
tests/                  # 업로드 및 OpenAI 모의 응답 테스트
.env.example             # 비밀 값이 없는 환경 변수 예제
vercel.json              # 함수 실행 시간 설정
```

- `GET /api/health`: 상태 확인
- `GET /api/config`: 공개 가능한 설정만 반환
- `POST /api/transform`: multipart의 `image`, `style`, 선택적 `prompt`를 받아 PNG 반환
- 업로드: JPG·PNG·WEBP, 정적 이미지, 최대 4MB·2,500만 화소
- 결과: 최대 1024×1024 PNG, 최대 4MB

## Vercel 배포

1. Vercel에서 이 GitHub 저장소를 Import합니다.
2. 프로젝트 루트는 저장소 루트, Framework Preset은 **Express**, Node.js는 **24.x**를 사용합니다. Build Command 및 Output Directory는 기본값으로 둡니다.
3. Vercel의 환경 변수에 `OPENAI_API_KEY`와 `IMAGE_PROVIDER=openai`를 등록합니다. 로컬 `.env`는 업로드하지 않으며 `PORT`는 설정하지 않습니다.
4. Deploy 후 `/api/health`와 사진 업로드를 확인합니다. 환경 변수를 바꾸면 재배포하세요.

Vercel은 `src/app.js`를 함수로 실행하고 `public/`을 정적 파일로 제공합니다. 프론트엔드는 같은 출처의 `/api/transform`을 호출하므로 별도 API 주소 설정이 필요 없습니다. 서버는 업로드를 디스크에 저장하지 않습니다.
함수 최대 실행 시간은 120초, OpenAI 요청 제한은 105초입니다. 긴 작업이나 큰 파일은 별도 저장소와 비동기 처리로 확장할 수 있습니다.

## 보안 및 검증

`.gitignore`와 `.vercelignore`로 `.env`, 의존성, 로그, 로컬 설정을 제외합니다. 키는 서버 환경 변수로만 읽으며 프론트엔드에 전달하지 않습니다. AI 모드에서는 사진과 요청이 OpenAI에 전송됩니다.

`npm test`는 업로드 검증, 이미지 응답, 오류 처리 및 비공개 파일 차단을 검증합니다. OpenAI 응답을 모의 처리하므로 유료 생성을 호출하지 않습니다. 실제 배포·계정의 이미지 생성 성공 여부는 별도로 확인하세요. 공개 운영 전 인증 및 사용자별 요청 제한을 추가하세요.

공식 문서: [이미지 편집 API](https://developers.openai.com/api/reference/resources/images/methods/edit), [Express on Vercel](https://vercel.com/docs/frameworks/backend/express).

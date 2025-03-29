# 1
```
pip install fastapi uvicorn pydantic numpy ffmpeg-python
```


# 2
```
uvicorn main:app --reload
```


# 3
```
pip install torch torchvision torchaudio
pip install faster-whisper
```

# 음성 인식 메모 애플리케이션 (FSD 구조)

이 프로젝트는 Feature-Sliced Design(FSD) 구조를 사용하여 구현된 음성 인식 메모 애플리케이션입니다.

## FSD 구조

프로젝트는 다음 계층으로 구성되어 있습니다:

### 1. shared
공통으로 사용되는 유틸리티, API, 타입 등이 포함됩니다.
- `lib`: 유틸리티 함수 (오디오 처리, WAV 변환 등)
- `api`: API 클라이언트 및 통신 관련 함수
- `types`: 공통 타입 정의

### 2. entities
비즈니스 엔티티가 포함됩니다.
- `memo`: 메모 관련 엔티티
  - `model`: 메모 모델, 타입 정의
  - `ui`: 메모 관련 UI 컴포넌트

### 3. features
비즈니스 기능이 포함됩니다.
- `audioRecording`: 오디오 녹음 기능
  - `model`: 녹음 hook 및 로직
- `speechRecognition`: 음성 인식 기능
  - `model`: 실시간 음성 인식 hook 및 로직

### 4. widgets
여러 기능과 엔티티를 조합한 UI 블록이 포함됩니다.
- `voiceMemo`: 음성 메모 위젯
  - `ui`: 음성 메모 컴포넌트

### 5. app (front/src/app)
페이지와 레이아웃이 포함됩니다.
- `page.tsx`: 메인 페이지
- `layout.tsx`: 앱 레이아웃

## 실행 방법

1. 백엔드 서버 실행:
```bash
# 백엔드 서버 실행 명령어
```

2. 프론트엔드 실행:
```bash
cd front
npm install
npm run dev
```
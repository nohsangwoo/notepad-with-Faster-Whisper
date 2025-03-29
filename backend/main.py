import io
from typing import Union
import wave
from fastapi import FastAPI, File, UploadFile, WebSocket, WebSocketDisconnect
import numpy as np
from faster_whisper import WhisperModel
from fastapi.middleware.cors import CORSMiddleware
import os
import subprocess

app = FastAPI()

# CORS 설정 추가
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # 프론트엔드 주소
    allow_credentials=True,
    allow_methods=["*"],  # 모든 HTTP 메소드 허용
    allow_headers=["*"],  # 모든 헤더 허용
)

model_size = "small" # 모델 크기 선택(cpu 사용시 small, GPU사용시 Large-v2)
device = "cpu" # 모델 사용 장치 선택(cpu 사용시 cpu, GPU사용시 cuda)
compute_type = "int8" # 모델 사용 장치 선택(cpu 사용시 int8, GPU사용시 float32)
model = WhisperModel(model_size, device=device, compute_type=compute_type)

@app.get("/")
def read_root():
    return {"message": "Hello, World!"}

@app.post("/transcribe/")
async def transcribe_audio(file: UploadFile = File(...)):
    audio_path = f"temp_{file.filename}"
    # 파일 저장
    with open(audio_path, "wb") as buffer:
        buffer.write(await file.read())
    # Faster-Whisper로 변환
    segments, _ = model.transcribe(audio_path)
    text = " ".join(segment.text for segment in segments)
    return {"transcription": text}

@app.websocket("/ws/transcribe/")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("🔗 클라이언트 연결됨")

    try:
        while True:
            # 클라이언트에서 오디오 데이터 스트리밍 받기
            data = await websocket.receive_bytes()
            print(f"오디오 데이터 수신: {len(data)} 바이트")
            
            try:
                # 임시 파일로 저장
                temp_file = "temp_websocket_audio.raw"
                with open(temp_file, "wb") as f:
                    f.write(data)
                
                # 직접 PCM 데이터로 변환 (FFmpeg 우회)
                output_file = "temp_websocket_audio.wav"
                
                # 모든 데이터를 int16 배열로 변환 시도
                try:
                    # 데이터 크기 확인 (짝수 바이트인지)
                    if len(data) % 2 != 0:
                        # 패딩 추가하여 짝수 크기로 맞춤
                        data = data + b'\0'
                    
                    # int16으로 변환
                    audio_data = np.frombuffer(data, dtype=np.int16)
                    
                    # WAV 파일 생성
                    with wave.open(output_file, "wb") as wav_file:
                        wav_file.setnchannels(1)  # 모노
                        wav_file.setsampwidth(2)  # 16비트 = 2바이트
                        wav_file.setframerate(16000)  # 16kHz
                        wav_file.writeframes(audio_data.tobytes())
                    
                    print("오디오 데이터 -> WAV 변환 성공")
                except Exception as conv_error:
                    print(f"오디오 변환 오류: {conv_error}")
                    continue
                
                # 파일 크기가 너무 작으면 처리하지 않음
                if os.path.getsize(output_file) < 1000:
                    print("오디오 파일이 너무 작습니다. 처리 건너뜀")
                    continue
                
                # Faster-Whisper로 변환
                try:
                    segments, _ = model.transcribe(output_file)
                    text = " ".join(segment.text for segment in segments)
                    print(f"인식 결과: '{text}'")
                    
                    # 변환된 텍스트를 클라이언트로 전송
                    if text and text.strip():
                        await websocket.send_text(text)
                    else:
                        print("음성 인식 결과가 비어 있습니다")
                except Exception as whisper_error:
                    print(f"Whisper 처리 오류: {whisper_error}")
                    continue
                
            except Exception as process_error:
                print(f"오디오 처리 중 오류: {process_error}")
                continue

    except WebSocketDisconnect:
        print("❌ 클라이언트 연결 종료")
    except Exception as e:
        print(f"웹소켓 오류: {e}")

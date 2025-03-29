import asyncio
import websockets
import sounddevice as sd
import numpy as np
import io
import wave

# WebSocket 서버 주소
WS_SERVER = "ws://127.0.0.1:8000/ws/transcribe/"

# 오디오 설정 (샘플링 레이트: 16kHz, 채널: 1(모노))
SAMPLE_RATE = 16000
CHANNELS = 1
DURATION = 5  # 초 단위 녹음 길이 (테스트용)

async def send_audio():
    async with websockets.connect(WS_SERVER) as websocket:
        print("🔗 WebSocket 서버 연결됨! 🎤 음성을 말하세요...")

        # 마이크에서 음성 녹음
        audio_data = sd.rec(int(SAMPLE_RATE * DURATION), samplerate=SAMPLE_RATE, channels=CHANNELS, dtype=np.int16)
        sd.wait()

        # 녹음된 데이터를 WAV 포맷으로 변환
        audio_buffer = io.BytesIO()
        with wave.open(audio_buffer, 'wb') as wav_file:
            wav_file.setnchannels(CHANNELS)
            wav_file.setsampwidth(2)  # 16비트 오디오
            wav_file.setframerate(SAMPLE_RATE)
            wav_file.writeframes(audio_data.tobytes())

        # WebSocket으로 전송
        await websocket.send(audio_buffer.getvalue())

        # 서버에서 변환된 텍스트 받기
        response = await websocket.recv()
        print("📝 변환된 텍스트:", response)

asyncio.run(send_audio())
import asyncio
import websockets
import sounddevice as sd
import numpy as np
import io
import wave
import webrtcvad  # pip install webrtcvad
import time
import collections
import queue
import threading


# 실행 방법
# python test_siri_like.py --duration 120 (120초 동안 실행)

# 설정
SAMPLE_RATE = 16000
CHANNELS = 1
FRAME_DURATION_MS = 30  # WebRTC VAD는 10, 20, 30ms 프레임만 지원
VAD_MODE = 3  # 0~3 범위, 3이 가장 공격적(침묵 감지에 민감)
PADDING_DURATION_MS = 300  # 음성 전후에 추가할 패딩(침묵) 시간
SILENT_CHUNKS_THRESHOLD = 20  # 이 개수의 연속된 침묵 프레임이 감지되면 종료

class Audio(object):
    """오디오 스트림을 처리하는 클래스"""
    def __init__(self, loop, async_queue):
        self.buffer_queue = queue.Queue()
        self.recording = True
        self.vad = webrtcvad.Vad(VAD_MODE)
        self.num_voiced_frames = 0
        self.num_silent_frames = 0
        self.frames = []
        self.loop = loop
        self.async_queue = async_queue

    def frame_generator(self):
        """오디오 프레임 생성기"""
        while self.recording:
            try:
                data = self.buffer_queue.get(block=True, timeout=1)
                yield data
            except queue.Empty:
                break

    def callback_audio(self, indata, frames, time, status):
        """오디오 콜백 함수"""
        if status:
            print(f"오디오 상태: {status}")
        self.buffer_queue.put(bytes(indata))

    def vad_collector(self, threshold=SILENT_CHUNKS_THRESHOLD):
        """VAD를 통해 음성 구간 검출"""
        frame_duration_ms = FRAME_DURATION_MS
        frame_size = int(SAMPLE_RATE * frame_duration_ms / 1000)
        ring_buffer = collections.deque(maxlen=threshold)
        
        triggered = False
        for frame in self.frame_generator():
            is_speech = self.vad.is_speech(frame, SAMPLE_RATE)
            
            if not triggered:
                if is_speech:
                    triggered = True
                    print("🎙️ 음성 감지됨 - 녹음 시작")
                    for f in ring_buffer:
                        self.frames.append(f)
                    self.frames.append(frame)
                    self.num_voiced_frames += 1
                    ring_buffer.clear()
                else:
                    ring_buffer.append(frame)
            else:
                if is_speech:
                    self.frames.append(frame)
                    self.num_voiced_frames += 1
                    self.num_silent_frames = 0
                else:
                    self.frames.append(frame)
                    self.num_silent_frames += 1
                    
                    # 침묵이 일정 기간 계속되면 음성 세그먼트 종료
                    if self.num_silent_frames > threshold:
                        triggered = False
                        print(f"✅ 음성 세그먼트 종료 (음성 프레임: {self.num_voiced_frames})")
                        
                        if self.num_voiced_frames > 0:
                            # 오디오 데이터를 메인 스레드로 안전하게 전달
                            audio_data = b''.join(self.frames)
                            if len(audio_data) > 1000:  # 너무 짧은 오디오는 무시
                                audio_buffer = io.BytesIO()
                                with wave.open(audio_buffer, 'wb') as wav_file:
                                    wav_file.setnchannels(CHANNELS)
                                    wav_file.setsampwidth(2)
                                    wav_file.setframerate(SAMPLE_RATE)
                                    wav_file.writeframes(audio_data)
                                
                                # 메인 이벤트 루프의 큐에 안전하게 데이터 추가
                                self.loop.call_soon_threadsafe(
                                    self.async_queue.put_nowait, 
                                    audio_buffer.getvalue()
                                )
                        
                        self.frames = []
                        self.num_voiced_frames = 0
                        self.num_silent_frames = 0
                        ring_buffer.clear()

async def siri_like_transcribe(duration=60):
    """Siri처럼 실시간으로 음성 인식하는 함수"""
    print(f"🎤 Siri 스타일 음성 인식 시작 (최대 {duration}초)")
    
    loop = asyncio.get_running_loop()
    audio_queue = asyncio.Queue()
    
    # WebSocket 연결
    async with websockets.connect("ws://127.0.0.1:8000/ws/transcribe/") as websocket:
        print("🔗 WebSocket 서버 연결됨")
        
        # 오디오 처리 객체 생성 (현재 이벤트 루프와 큐 전달)
        audio = Audio(loop, audio_queue)
        
        # 오디오 스트림 시작
        frame_duration_ms = FRAME_DURATION_MS
        frame_size = int(SAMPLE_RATE * frame_duration_ms / 1000)
        stream = sd.InputStream(
            samplerate=SAMPLE_RATE,
            channels=CHANNELS,
            dtype=np.int16,
            blocksize=frame_size,
            callback=audio.callback_audio
        )
        
        # VAD 스레드 시작
        vad_thread = threading.Thread(target=audio.vad_collector)
        
        try:
            with stream:
                print("🎧 듣고 있습니다... (말씀하세요)")
                vad_thread.start()
                
                # 시간 제한
                start_time = time.time()
                
                # 음성 처리 루프
                while time.time() - start_time < duration:
                    # 음성 데이터 대기
                    try:
                        audio_data = await asyncio.wait_for(audio_queue.get(), timeout=0.5)
                        
                        # WebSocket으로 전송
                        await websocket.send(audio_data)
                        
                        # 결과 수신
                        response = await websocket.recv()
                        print(f"📝 인식 결과: {response}")
                        
                    except asyncio.TimeoutError:
                        # 타임아웃은 무시
                        pass
                
                print(f"⏱️ 최대 시간 ({duration}초)에 도달했습니다.")
                
        finally:
            # 정리
            audio.recording = False
            if vad_thread.is_alive():
                vad_thread.join(timeout=1)

if __name__ == "__main__":
    asyncio.run(siri_like_transcribe(duration=60)) 
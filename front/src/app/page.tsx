"use client";

import Image from "next/image";
import { useState, useRef, useEffect } from "react";

export default function Home() {
  const [transcription, setTranscription] = useState<string>("");
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isRealTimeRecording, setIsRealTimeRecording] = useState<boolean>(false);
  const [memo, setMemo] = useState<string[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const websocketRef = useRef<WebSocket | null>(null);
  
  // VAD 관련 상태와 변수들
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioDataRef = useRef<Uint8Array | null>(null);
  const silenceDetectionRef = useRef<{
    triggered: boolean;
    silentFrames: number;
    voicedFrames: number;
    audioBuffer: Float32Array[];
    silenceThreshold: number;
    minSilentFrames: number;
    silentFrameThreshold: number;
  }>({
    triggered: false,
    silentFrames: 0,
    voicedFrames: 0,
    audioBuffer: [],
    silenceThreshold: 0.01, // 소리 감지 임계값 (조정 가능)
    minSilentFrames: 15,    // 최소 침묵 프레임 수 (약 0.5초, 조정 가능)
    silentFrameThreshold: 0.3, // 침묵으로 간주할 볼륨 임계값 (조정 가능)
  });
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const framesSinceLastSendRef = useRef<number>(0);

  // 버튼을 눌러서 녹음 시작
  const startRecording = async () => {
    try {
      // 이미 진행 중인 녹음이 있다면 중지
      if (isRealTimeRecording) {
        await stopRealTimeRecording();
      }
      
      audioChunksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error("녹음 시작 오류:", error);
    }
  };

  // 버튼에서 손 떼면 녹음 종료 및 전송
  const stopRecording = async () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      // 녹음이 완료되면 오디오 처리
      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        await sendAudioToServer(audioBlob);
        
        // 스트림 종료
        const tracks = mediaRecorderRef.current?.stream?.getTracks() || [];
        tracks.forEach(track => track.stop());
      };
    }
  };
  
  // 녹음된 오디오를 서버로 전송
  const sendAudioToServer = async (audioBlob: Blob) => {
    try {
      const formData = new FormData();
      formData.append("file", audioBlob, "audio.wav");
      
      const response = await fetch("http://localhost:8000/transcribe/", {
        method: "POST",
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error(`서버 응답 오류: ${response.status}`);
      }
      
      const data = await response.json();
      setTranscription(data.transcription);
      setMemo(prev => [...prev, data.transcription]);
    } catch (error) {
      console.error("오디오 전송 오류:", error);
      setTranscription("서버 연결 오류가 발생했습니다. 백엔드 서버가 실행 중인지 확인해주세요.");
    }
  };

  // 시리 스타일 음성 감지 및 처리
  const processSiriStyleAudio = (audioProcessingEvent: AudioProcessingEvent) => {
    const inputBuffer = audioProcessingEvent.inputBuffer;
    const inputData = inputBuffer.getChannelData(0);
    const pcmData = new Int16Array(inputData.length);
    
    // 음성 활성화 감지 (VAD)
    let sum = 0;
    let max = 0;
    
    // 입력 데이터의 볼륨 계산 (RMS)
    for (let i = 0; i < inputData.length; i++) {
      const absValue = Math.abs(inputData[i]);
      sum += absValue * absValue;
      max = Math.max(max, absValue);
      
      // 동시에 PCM 데이터 변환
      pcmData[i] = Math.max(-32768, Math.min(32767, Math.floor(inputData[i] * 32768)));
    }
    
    const rms = Math.sqrt(sum / inputData.length);
    const isSilent = rms < silenceDetectionRef.current.silentFrameThreshold;
    
    // 음성 버퍼에 현재 프레임 추가
    silenceDetectionRef.current.audioBuffer.push(new Float32Array(inputData));
    
    // 음성 상태 업데이트
    if (!silenceDetectionRef.current.triggered) {
      if (!isSilent) {
        // 음성 감지 시작
        console.log("🎙️ 음성 감지됨 - 녹음 시작");
        silenceDetectionRef.current.triggered = true;
        silenceDetectionRef.current.voicedFrames = 1;
        silenceDetectionRef.current.silentFrames = 0;
      }
    } else {
      if (!isSilent) {
        // 음성 계속 감지
        silenceDetectionRef.current.voicedFrames++;
        silenceDetectionRef.current.silentFrames = 0;
      } else {
        // 침묵 감지
        silenceDetectionRef.current.silentFrames++;
        
        // 일정 시간 이상 침묵이 지속되면 음성 세그먼트 종료
        if (silenceDetectionRef.current.silentFrames > silenceDetectionRef.current.minSilentFrames) {
          console.log(`✅ 음성 세그먼트 종료 (음성 프레임: ${silenceDetectionRef.current.voicedFrames})`);
          
          if (silenceDetectionRef.current.voicedFrames > 5) { // 최소한의 유의미한 음성 프레임 수
            // 오디오 데이터 준비 및 전송
            const allAudioData = concatenateAudioBuffers(silenceDetectionRef.current.audioBuffer);
            
            // WAV 형식으로 변환
            const wavBuffer = createWavFromAudioBuffer(allAudioData, 16000);
            
            // 웹소켓으로 전송
            if (websocketRef.current?.readyState === WebSocket.OPEN) {
              websocketRef.current.send(wavBuffer);
            }
          }
          
          // 상태 초기화
          silenceDetectionRef.current.triggered = false;
          silenceDetectionRef.current.voicedFrames = 0;
          silenceDetectionRef.current.silentFrames = 0;
          silenceDetectionRef.current.audioBuffer = [];
        }
      }
    }
    
    // 버퍼가 너무 커지지 않도록 제한
    if (silenceDetectionRef.current.audioBuffer.length > 300) { // 약 10초 분량
      silenceDetectionRef.current.audioBuffer = [];
      silenceDetectionRef.current.triggered = false;
      silenceDetectionRef.current.voicedFrames = 0;
      silenceDetectionRef.current.silentFrames = 0;
      console.log("⚠️ 오디오 버퍼가 너무 커서 초기화됨");
    }
  };

  // Float32Array 배열을 하나의 배열로 합치는 유틸리티 함수
  const concatenateAudioBuffers = (buffers: Float32Array[]): Float32Array => {
    let totalLength = 0;
    for (const buffer of buffers) {
      totalLength += buffer.length;
    }
    
    const result = new Float32Array(totalLength);
    let offset = 0;
    
    for (const buffer of buffers) {
      result.set(buffer, offset);
      offset += buffer.length;
    }
    
    return result;
  };

  // Float32Array 오디오 데이터를 WAV 포맷으로 변환하는 함수
  const createWavFromAudioBuffer = (audioBuffer: Float32Array, sampleRate: number): ArrayBuffer => {
    // PCM 데이터로 변환
    const pcmData = new Int16Array(audioBuffer.length);
    for (let i = 0; i < audioBuffer.length; i++) {
      pcmData[i] = Math.max(-32768, Math.min(32767, Math.floor(audioBuffer[i] * 32768)));
    }
    
    // WAV 헤더 생성
    const wavBuffer = new ArrayBuffer(44 + pcmData.byteLength);
    const view = new DataView(wavBuffer);
    
    // RIFF 청크 헤더
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + pcmData.byteLength, true);
    writeString(view, 8, 'WAVE');
    
    // fmt 하위 청크
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // fmt 청크 크기
    view.setUint16(20, 1, true); // 오디오 포맷 (1 = PCM)
    view.setUint16(22, 1, true); // 채널 수
    view.setUint32(24, sampleRate, true); // 샘플레이트
    view.setUint32(28, sampleRate * 2, true); // 바이트 레이트
    view.setUint16(32, 2, true); // 블록 얼라인
    view.setUint16(34, 16, true); // 비트 뎁스
    
    // 데이터 하위 청크
    writeString(view, 36, 'data');
    view.setUint32(40, pcmData.byteLength, true);
    
    // 오디오 데이터 쓰기
    const pcmBytes = new Uint8Array(wavBuffer, 44);
    const pcmByteView = new Uint8Array(pcmData.buffer);
    pcmBytes.set(pcmByteView);
    
    return wavBuffer;
  };
  
  // DataView에 문자열 쓰는 헬퍼 함수
  const writeString = (view: DataView, offset: number, string: string): void => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  // 실시간 음성 인식 시작
  const startRealTimeRecording = async () => {
    try {
      // 이미 진행 중인 일반 녹음이 있다면 중지
      if (isRecording) {
        await stopRecording();
      }
      
      // 이미 실시간 녹음이 진행 중이라면 중지 후 재시작
      if (isRealTimeRecording) {
        await stopRealTimeRecording();
        // 리소스 정리를 위해 약간의 지연 추가
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
      // WebSocket 연결
      websocketRef.current = new WebSocket("ws://localhost:8000/ws/transcribe/");
      
      // 웹소켓 연결 타임아웃 설정
      const wsConnectionTimeout = setTimeout(() => {
        if (websocketRef.current?.readyState !== WebSocket.OPEN) {
          console.error("WebSocket 연결 타임아웃");
          setTranscription("서버 연결 오류: 웹소켓 연결 시간 초과. 백엔드 서버가 실행 중인지 확인해주세요.");
          if (websocketRef.current) {
            websocketRef.current.close();
            websocketRef.current = null;
          }
          setIsRealTimeRecording(false);
        }
      }, 5000); // 5초 타임아웃
      
      websocketRef.current.onopen = () => {
        console.log("WebSocket 연결됨");
        clearTimeout(wsConnectionTimeout);
        setIsRealTimeRecording(true);
      };
      
      websocketRef.current.onmessage = (event) => {
        const text = event.data;
        console.log("서버로부터 응답 받음:", text);
        if (text && text.trim() !== "") {
          setTranscription(text);
          setMemo(prev => [...prev, text]);
        }
      };
      
      websocketRef.current.onerror = (error) => {
        console.error("WebSocket 오류:", error);
        setTranscription("웹소켓 오류가 발생했습니다. 백엔드 서버가 실행 중인지 확인해주세요.");
      };
      
      websocketRef.current.onclose = (event) => {
        console.log(`WebSocket 연결 종료 (코드: ${event.code}, 이유: ${event.reason})`);
        clearTimeout(wsConnectionTimeout);
        setIsRealTimeRecording(false);
      };
      
      // 오디오 스트림 설정
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      
      streamRef.current = stream;
      
      // 오디오 컨텍스트 설정
      try {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
          sampleRate: 16000,
          latencyHint: 'interactive'
        });
        
        audioContextRef.current = audioContext;
        
        // 오디오 소스 및 분석기 생성
        const source = audioContext.createMediaStreamSource(stream);
        sourceRef.current = source;
        
        // 오디오 처리 노드 생성
        const processor = audioContext.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;
        
        // VAD 분석을 위한 분석기 노드 생성
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        analyserRef.current = analyser;
        
        const audioData = new Uint8Array(analyser.frequencyBinCount);
        audioDataRef.current = audioData;
        
        // 연결: 소스 -> 분석기 -> 프로세서 -> 출력
        source.connect(analyser);
        source.connect(processor);
        processor.connect(audioContext.destination);
        
        // 오디오 처리 이벤트 핸들러 설정
        processor.onaudioprocess = processSiriStyleAudio;
        
        // 초기화
        silenceDetectionRef.current = {
          triggered: false,
          silentFrames: 0,
          voicedFrames: 0,
          audioBuffer: [],
          silenceThreshold: 0.01,
          minSilentFrames: 15,
          // 침묵 임계값 조정 - 더 낮은 값으로 설정하여 음성 감지 민감도 향상
          silentFrameThreshold: 0.015, 
        };
        
        setIsRealTimeRecording(true);
      } catch (audioError) {
        console.error("오디오 컨텍스트 설정 오류:", audioError);
        // 오류 발생 시 스트림 정리
        if (stream) {
          stream.getTracks().forEach(track => track.stop());
        }
        if (websocketRef.current) {
          websocketRef.current.close();
          websocketRef.current = null;
        }
        throw audioError;
      }
    } catch (error) {
      console.error("실시간 녹음 시작 오류:", error);
      setTranscription("서버 연결 오류가 발생했습니다. 백엔드 서버가 실행 중인지 확인해주세요.");
      setIsRealTimeRecording(false);
    }
  };

  // 실시간 음성 인식 종료
  const stopRealTimeRecording = () => {
    return new Promise<void>((resolve) => {
      if (isRealTimeRecording) {
        console.log("실시간 음성 인식 정리 중...");
        
        // 오디오 처리 중지
        if (processorRef.current) {
          try {
            processorRef.current.disconnect();
          } catch (e) {
            console.warn("프로세서 연결 해제 오류:", e);
          }
          processorRef.current = null;
        }
        
        if (sourceRef.current) {
          try {
            sourceRef.current.disconnect();
          } catch (e) {
            console.warn("소스 연결 해제 오류:", e);
          }
          sourceRef.current = null;
        }
        
        if (audioContextRef.current) {
          try {
            audioContextRef.current.close();
          } catch (e) {
            console.warn("오디오 컨텍스트 종료 오류:", e);
          }
          audioContextRef.current = null;
        }
        
        // 분석기 정리
        analyserRef.current = null;
        audioDataRef.current = null;
        
        // 스트림 종료
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => {
            try {
              track.stop();
            } catch (e) {
              console.warn("트랙 종료 오류:", e);
            }
          });
          streamRef.current = null;
        }
        
        // WebSocket 연결 종료
        if (websocketRef.current) {
          try {
            // WebSocket이 아직 연결 중이라면 정상 종료
            if (websocketRef.current.readyState === WebSocket.OPEN || 
                websocketRef.current.readyState === WebSocket.CONNECTING) {
              websocketRef.current.close(1000, "사용자가 녹음 종료");
            }
          } catch (e) {
            console.warn("웹소켓 종료 오류:", e);
          }
          websocketRef.current = null;
        }
        
        // VAD 상태 초기화
        silenceDetectionRef.current = {
          triggered: false,
          silentFrames: 0,
          voicedFrames: 0,
          audioBuffer: [],
          silenceThreshold: 0.01,
          minSilentFrames: 15,
          silentFrameThreshold: 0.3,
        };
        
        setIsRealTimeRecording(false);
        
        // 약간의 지연 후에 정리 완료 알림
        setTimeout(() => {
          console.log("실시간 음성 인식 리소스 정리 완료");
          resolve();
        }, 100);
      } else {
        resolve();
      }
    });
  };

  // 컴포넌트 언마운트 시 리소스 정리
  useEffect(() => {
    return () => {
      console.log("컴포넌트 언마운트 - 리소스 정리 중");
      
      // 일반 녹음 정리
      if (mediaRecorderRef.current && mediaRecorderRef.current.stream) {
        try {
          const tracks = mediaRecorderRef.current.stream.getTracks();
          tracks.forEach(track => track.stop());
        } catch (e) {
          console.warn("MediaRecorder 스트림 정리 오류:", e);
        }
        mediaRecorderRef.current = null;
      }
      
      // 실시간 녹음 정리
      if (processorRef.current) {
        try {
          processorRef.current.disconnect();
        } catch (e) {
          console.warn("프로세서 연결 해제 오류:", e);
        }
        processorRef.current = null;
      }
      
      if (sourceRef.current) {
        try {
          sourceRef.current.disconnect();
        } catch (e) {
          console.warn("소스 연결 해제 오류:", e);
        }
        sourceRef.current = null;
      }
      
      if (audioContextRef.current) {
        try {
          audioContextRef.current.close();
        } catch (e) {
          console.warn("오디오 컨텍스트 종료 오류:", e);
        }
        audioContextRef.current = null;
      }
      
      if (streamRef.current) {
        try {
          streamRef.current.getTracks().forEach(track => track.stop());
        } catch (e) {
          console.warn("스트림 트랙 정리 오류:", e);
        }
        streamRef.current = null;
      }
      
      // WebSocket 연결 종료
      if (websocketRef.current) {
        try {
          websocketRef.current.close();
        } catch (e) {
          console.warn("웹소켓 종료 오류:", e);
        }
        websocketRef.current = null;
      }
      
      console.log("모든 리소스 정리 완료");
    };
  }, []);

  return (
    <div className="grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20 font-[family-name:var(--font-geist-sans)]">
      <main className="flex flex-col gap-[32px] row-start-2 items-center sm:items-start w-full max-w-3xl">
        <Image
          className="dark:invert"
          src="/next.svg"
          alt="Next.js logo"
          width={180}
          height={38}
          priority
        />
        
        {/* 음성 메모 섹션 */}
        <div className="w-full p-6 bg-gray-50 dark:bg-gray-800 rounded-lg shadow-md">
          <h2 className="text-2xl font-bold mb-4">음성 메모</h2>
          
          {/* 음성 메모 버튼 */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <button
              className={`rounded-full px-6 py-3 font-medium ${
                isRecording 
                  ? "bg-red-500 text-white" 
                  : "bg-black text-white dark:bg-white dark:text-black"
              }`}
              onMouseDown={startRecording}
              onMouseUp={stopRecording}
              onTouchStart={startRecording}
              onTouchEnd={stopRecording}
            >
              {isRecording ? "녹음 중..." : "버튼을 누르고 말하기"}
            </button>
            
            <button
              className={`rounded-full px-6 py-3 font-medium ${
                isRealTimeRecording 
                  ? "bg-red-500 text-white" 
                  : "bg-green-600 text-white"
              }`}
              onClick={isRealTimeRecording ? stopRealTimeRecording : startRealTimeRecording}
            >
              {isRealTimeRecording ? "실시간 음성 인식 중지" : "실시간 음성 인식 시작"}
            </button>
          </div>
          
          {/* 현재 인식된 텍스트 */}
          {transcription && (
            <div className="mb-4 p-3 bg-white dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600">
              <p className="font-medium">현재 인식된 텍스트:</p>
              <p className="mt-2">{transcription}</p>
            </div>
          )}
          
          {/* 메모 목록 */}
          <div className="mt-6">
            <h3 className="text-lg font-semibold mb-2">저장된 메모</h3>
            {memo.length > 0 ? (
              <ul className="space-y-2">
                {memo.map((text, index) => (
                  <li key={index} className="p-3 bg-white dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600">
                    {text}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-500 dark:text-gray-400">저장된 메모가 없습니다.</p>
            )}
          </div>
        </div>
      </main>
      <footer className="row-start-3 flex gap-[24px] flex-wrap items-center justify-center">
        <a
          className="flex items-center gap-2 hover:underline hover:underline-offset-4"
          href="https://nextjs.org/learn?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Image
            aria-hidden
            src="/file.svg"
            alt="File icon"
            width={16}
            height={16}
          />
          Learn
        </a>
        <a
          className="flex items-center gap-2 hover:underline hover:underline-offset-4"
          href="https://vercel.com/templates?framework=next.js&utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Image
            aria-hidden
            src="/window.svg"
            alt="Window icon"
            width={16}
            height={16}
          />
          Examples
        </a>
        <a
          className="flex items-center gap-2 hover:underline hover:underline-offset-4"
          href="https://nextjs.org?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Image
            aria-hidden
            src="/globe.svg"
            alt="Globe icon"
            width={16}
            height={16}
          />
          Go to nextjs.org →
        </a>
      </footer>
    </div>
  );
}

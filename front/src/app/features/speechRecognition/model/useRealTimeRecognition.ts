"use client";

import { WEBSOCKET_URL } from "@/app/shared/api/transcription";
import { concatenateAudioBuffers, createWavFromAudioBuffer } from "@/app/shared/lib/audio/audioUtils";
import { VoiceActivityDetectionConfig } from "@/app/shared/types/audio";
import { useState, useRef, useCallback, useEffect } from "react";

export function useRealTimeRecognition() {
  const [isRealTimeRecording, setIsRealTimeRecording] = useState<boolean>(false);
  const [transcription, setTranscription] = useState<string>("");
  
  // 웹소켓 및 오디오 관련 참조
  const websocketRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioDataRef = useRef<Uint8Array | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  // VAD 설정
  const silenceDetectionRef = useRef<VoiceActivityDetectionConfig>({
    triggered: false,
    silentFrames: 0,
    voicedFrames: 0,
    audioBuffer: [],
    silenceThreshold: 0.01,
    minSilentFrames: 15,
    silentFrameThreshold: 0.015,
  });
  
  // 시리 스타일 음성 감지 및 처리
  const processSiriStyleAudio = useCallback((audioProcessingEvent: AudioProcessingEvent) => {
    const inputBuffer = audioProcessingEvent.inputBuffer;
    const inputData = inputBuffer.getChannelData(0);
    
    // 음성 활성화 감지 (VAD)
    let sum = 0;
    
    // 입력 데이터의 볼륨 계산 (RMS)
    for (let i = 0; i < inputData.length; i++) {
      const absValue = Math.abs(inputData[i]);
      sum += absValue * absValue;
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
  }, []);
  
  // 실시간 음성 인식 시작
  const startRealTimeRecording = useCallback(async () => {
    try {
      // 이미 실시간 녹음이 진행 중이라면 중지 후 재시작
      if (isRealTimeRecording) {
        await stopRealTimeRecording();
        // 리소스 정리를 위해 약간의 지연 추가
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
      // WebSocket 연결
      websocketRef.current = new WebSocket(WEBSOCKET_URL);
      
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
  }, [isRealTimeRecording, processSiriStyleAudio]);

  // 실시간 음성 인식 종료
  const stopRealTimeRecording = useCallback(() => {
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
  }, [isRealTimeRecording]);

  // 컴포넌트 언마운트 시 리소스 정리
  useEffect(() => {
    return () => {
      console.log("컴포넌트 언마운트 - 리소스 정리 중");
      
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
    };
  }, []);

  return {
    isRealTimeRecording,
    transcription,
    startRealTimeRecording,
    stopRealTimeRecording
  };
} 
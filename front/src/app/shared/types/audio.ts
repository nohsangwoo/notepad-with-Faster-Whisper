// VAD(Voice Activity Detection) 설정 타입
export interface VoiceActivityDetectionConfig {
  triggered: boolean;
  silentFrames: number;
  voicedFrames: number;
  audioBuffer: Float32Array[];
  silenceThreshold: number;
  minSilentFrames: number;
  silentFrameThreshold: number;
}

// 오디오 인식 결과 타입
export interface TranscriptionResult {
  transcription: string;
} 
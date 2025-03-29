// 오디오 버퍼 배열을 하나로 합치는 유틸리티 함수
export const concatenateAudioBuffers = (buffers: Float32Array[]): Float32Array => {
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
export const createWavFromAudioBuffer = (audioBuffer: Float32Array, sampleRate: number): ArrayBuffer => {
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
export const writeString = (view: DataView, offset: number, string: string): void => {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}; 
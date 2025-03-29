// 음성 인식 API URL
export const API_URL = 'http://localhost:8000/transcribe/';
export const WEBSOCKET_URL = 'ws://localhost:8000/ws/transcribe/';

// 녹음된 오디오를 서버로 전송하는 함수
export const sendAudioToServer = async (audioBlob: Blob): Promise<{ transcription: string }> => {
  try {
    const formData = new FormData();
    formData.append("file", audioBlob, "audio.wav");
    
    const response = await fetch(API_URL, {
      method: "POST",
      body: formData,
    });
    
    if (!response.ok) {
      throw new Error(`서버 응답 오류: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error("오디오 전송 오류:", error);
    throw new Error("서버 연결 오류가 발생했습니다. 백엔드 서버가 실행 중인지 확인해주세요.");
  }
}; 
"use client";

import { useState, useRef, useCallback } from "react";
import { sendAudioToServer } from "@/shared/api/transcription";

export function useAudioRecording() {
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // 버튼을 눌러서 녹음 시작
  const startRecording = useCallback(async () => {
    try {
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
  }, []);

  // 버튼에서 손 떼면 녹음 종료 및 전송
  const stopRecording = useCallback(async (): Promise<{ transcription: string } | null> => {
    if (!mediaRecorderRef.current || !isRecording) return null;
    
    return new Promise((resolve) => {
      mediaRecorderRef.current!.stop();
      setIsRecording(false);
      
      // 녹음이 완료되면 오디오 처리
      mediaRecorderRef.current!.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        
        try {
          const result = await sendAudioToServer(audioBlob);
          resolve(result);
        } catch (error) {
          console.error("오디오 처리 오류:", error);
          resolve(null);
        } finally {
          // 스트림 종료
          const tracks = mediaRecorderRef.current?.stream?.getTracks() || [];
          tracks.forEach(track => track.stop());
        }
      };
    });
  }, [isRecording]);

  return {
    isRecording,
    startRecording,
    stopRecording
  };
} 
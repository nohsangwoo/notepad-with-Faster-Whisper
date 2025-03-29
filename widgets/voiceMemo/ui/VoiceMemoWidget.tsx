"use client";

import React, { FC, useState, useCallback } from "react";
import { useAudioRecording } from "@/features/audioRecording/model/useAudioRecording";
import { useRealTimeRecognition } from "@/features/speechRecognition/model/useRealTimeRecognition";
import { MemoList } from "@/entities/memo/ui/MemoList";
import { CurrentTranscription } from "@/entities/memo/ui/CurrentTranscription";

export const VoiceMemoWidget: FC = () => {
  const [memo, setMemo] = useState<string[]>([]);
  const { isRecording, startRecording, stopRecording } = useAudioRecording();
  const { 
    isRealTimeRecording, 
    transcription, 
    startRealTimeRecording, 
    stopRealTimeRecording 
  } = useRealTimeRecognition();

  // 일반 녹음 중지 및 텍스트 추가
  const handleStopRecording = useCallback(async () => {
    const result = await stopRecording();
    if (result?.transcription) {
      setMemo(prev => [...prev, result.transcription]);
    }
  }, [stopRecording]);

  // 실시간 인식 텍스트 메모에 추가
  const handleAddToMemo = useCallback(() => {
    if (transcription && transcription.trim() !== "") {
      setMemo(prev => [...prev, transcription]);
    }
  }, [transcription]);

  return (
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
          onMouseUp={handleStopRecording}
          onTouchStart={startRecording}
          onTouchEnd={handleStopRecording}
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
        
        {isRealTimeRecording && (
          <button
            className="rounded-full px-6 py-3 font-medium bg-blue-500 text-white"
            onClick={handleAddToMemo}
          >
            현재 인식된 텍스트 메모에 추가
          </button>
        )}
      </div>
      
      {/* 현재 인식된 텍스트 */}
      <CurrentTranscription transcription={transcription} />
      
      {/* 메모 목록 */}
      <MemoList memos={memo} />
    </div>
  );
}; 
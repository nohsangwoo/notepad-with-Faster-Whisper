"use client";

import React from "react";
import { VoiceMemoWidget } from "./components/VoiceMemoWidget";

export default function AiVoicePage() {
  return (
    <div className="grid grid-rows-[auto_1fr_auto] items-center justify-items-center min-h-screen p-6 pb-20 sm:p-10">
      <header className="w-full max-w-3xl">
        <h1 className="text-3xl font-bold mb-6">AI 음성 메모</h1>
        <p className="text-gray-600 dark:text-gray-300 mb-8">
          음성을 텍스트로 변환하고 저장하는 AI 기반 음성 메모 애플리케이션입니다.
          버튼을 누르고 말하거나, 실시간 음성 인식 모드를 사용해보세요.
        </p>
      </header>
      
      <main className="flex flex-col gap-[32px] w-full max-w-3xl">
        <VoiceMemoWidget />
      </main>
      
      <footer className="mt-8 text-sm text-gray-500 dark:text-gray-400">
        © 2024 AI 음성 메모 앱 | Powered by Whisper STT
      </footer>
    </div>
  );
} 
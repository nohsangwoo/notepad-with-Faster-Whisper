"use client";

import React, { FC } from "react";

interface CurrentTranscriptionProps {
  transcription: string;
}

export const CurrentTranscription: FC<CurrentTranscriptionProps> = ({ transcription }) => {
  if (!transcription) return null;
  
  return (
    <div className="mb-4 p-3 bg-white dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600">
      <p className="font-medium">현재 인식된 텍스트:</p>
      <p className="mt-2">{transcription}</p>
    </div>
  );
}; 
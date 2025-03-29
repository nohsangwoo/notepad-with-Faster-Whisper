"use client";

import React, { FC } from "react";

interface MemoListProps {
  memos: string[];
}

export const MemoList: FC<MemoListProps> = ({ memos }) => {
  return (
    <div className="mt-6">
      <h3 className="text-lg font-semibold mb-2">저장된 메모</h3>
      {memos.length > 0 ? (
        <ul className="space-y-2">
          {memos.map((text, index) => (
            <li key={index} className="p-3 bg-white dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600">
              {text}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-gray-500 dark:text-gray-400">저장된 메모가 없습니다.</p>
      )}
    </div>
  );
}; 
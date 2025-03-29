// 메모 타입 정의
export interface Memo {
  id: string;
  text: string;
  createdAt: Date;
}

// 메모 생성 타입
export interface CreateMemoData {
  text: string;
} 
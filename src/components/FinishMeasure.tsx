'use client';
import { useRouter } from 'next/navigation'; // 반드시 next/navigation에서 가져와야 합니다.

export default function MyComponent() {
  const router = useRouter();

  const handleComplete = () => {
    // 1. 여기서 집중도 데이터를 서버에 저장하는 로직 실행
    // 2. 저장이 끝나면 페이지 이동
    router.push('/result');
  };

  return <button onClick={handleComplete}>측정 종료</button>;
}
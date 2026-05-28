import { redirect } from 'next/navigation';

// 대시보드는 이제 메인(/)과 동일. 옛 링크 호환용 redirect.
export default function DashboardRedirect() {
  redirect('/');
}

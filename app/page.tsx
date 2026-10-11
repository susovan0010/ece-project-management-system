import { redirect } from 'next/navigation';
import { auth } from '@/auth';

export default async function HomePage() {
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  const role = (session.user as { role?: string })?.role;
  if (role === 'ADMIN') {
    redirect('/admin/dashboard');
  } else {
    redirect('/faculty/topics');
  }
}

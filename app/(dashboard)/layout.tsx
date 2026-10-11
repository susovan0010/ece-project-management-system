import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { Sidebar } from '@/components/sidebar';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  const role = ((session.user as { role?: string })?.role || 'FACULTY') as 'ADMIN' | 'FACULTY';
  const userName = session.user.name || 'Department Member';
  const userEmail = session.user.email || '';

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar role={role} userName={userName} userEmail={userEmail} />
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="h-16 bg-white border-b border-slate-200 px-8 flex items-center justify-between sticky top-0 z-10">
          <div>
            <h1 className="text-base font-semibold text-slate-800 tracking-tight">
              {role === 'ADMIN' ? 'Project Committee Administration' : 'Supervisor Project Workspace'}
            </h1>
            <p className="text-xs text-slate-500">
              Department of Electronics and Communication Engineering • Heritage Institute of Technology
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                role === 'ADMIN'
                  ? 'bg-amber-100 text-amber-800 border border-amber-300'
                  : 'bg-blue-100 text-blue-800 border border-blue-300'
              }`}
            >
              {role === 'ADMIN' ? 'Committee Member' : 'Faculty Supervisor'}
            </span>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 p-8 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

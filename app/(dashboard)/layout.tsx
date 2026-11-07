import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { Sidebar } from '@/components/sidebar';
import { FirstLoginModal } from '@/components/first-login-modal';
import { resolveUserAuthority, getOrCreateDepartmentAuthority } from '@/lib/authority-service';
import { HodConsentBanner } from '@/components/hod-consent-banner';
import { calculateStudentBadges, StudentBadgeSummary } from '@/lib/engine/badge-engine';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect('/login');
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      name: true,
      email: true,
      role: true,
      mustChangePassword: true,
      domainExpertise: true,
    },
  });

  const sessionRole = (session.user as { role?: string })?.role as
    | 'ADMIN'
    | 'FACULTY'
    | 'STUDENT'
    | undefined;
  const role = (sessionRole || dbUser?.role || 'FACULTY') as
    | 'ADMIN'
    | 'FACULTY'
    | 'STUDENT';
  const accountRole = (dbUser?.role || role) as 'ADMIN' | 'FACULTY' | 'STUDENT';
  const userName = dbUser?.name || session.user.name || 'Department Member';
  const userEmail = dbUser?.email || session.user.email || '';
  const mustChangePassword = dbUser?.mustChangePassword ?? false;

  const authority = await getOrCreateDepartmentAuthority();
  const authorityLevel = await resolveUserAuthority({
    id: session.user.id,
    email: userEmail,
    role: role === 'STUDENT' ? 'FACULTY' : role,
  });

  const isHodPendingRemoval =
    role === 'ADMIN' &&
    Boolean(authority.hodRemovalRequested && authority.hodUserId === session.user.id);

  let studentBadges: StudentBadgeSummary | null = null;
  if (role === 'STUDENT') {
    const markupVotes = await prisma.forumMarkupVote.findMany({
      where: { targetUserId: session.user.id },
      select: { value: true },
    });
    const netMarks = markupVotes.reduce((sum, v) => sum + (v.value || 0), 0);
    studentBadges = calculateStudentBadges(netMarks);
  }

  return (
    <div className="flex min-h-screen bg-slate-50 print:block print:min-h-0 print:bg-white">
      <Sidebar
        role={role}
        authorityLevel={authorityLevel}
        userName={userName}
        userEmail={userEmail}
      />
      <div className="flex-1 flex flex-col min-w-0 print:block">
        {isHodPendingRemoval && (
          <HodConsentBanner
            requestedAt={authority.hodRemovalRequestedAt?.toISOString()}
            superAdminName={authority.superAdminUser?.name || 'Super Admin Type A'}
          />
        )}
        {/* Top Header */}
        <header className="no-print print:hidden h-16 bg-white border-b border-slate-200 px-8 flex items-center justify-between sticky top-0 z-10">
          <div>
            <h1 className="text-base font-semibold text-slate-800 tracking-tight">
              {role === 'ADMIN'
                ? 'Project Committee Administration'
                : role === 'STUDENT'
                ? 'Student Project Portal'
                : 'Supervisor Project Workspace'}
            </h1>
            <p className="text-xs text-slate-500">
              Department of Electronics and Communication Engineering • Heritage Institute of Technology
            </p>
          </div>
          <div className="flex items-center gap-3">
            {role !== 'STUDENT' && (
              <FirstLoginModal
                role={accountRole as 'ADMIN' | 'FACULTY'}
                userName={userName}
                userEmail={userEmail}
                mustChangePassword={mustChangePassword}
                userDomains={dbUser?.domainExpertise || []}
              />
            )}
            {role === 'STUDENT' && studentBadges && (
              <div
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-300 text-amber-900 shadow-sm"
                title={`Supervisor Recognition Standing: ${studentBadges.effectiveScore} pts`}
              >
                <span className="font-bold font-mono">
                  {studentBadges.effectiveScore > 0 ? `+${studentBadges.effectiveScore}` : studentBadges.effectiveScore} pts
                </span>
                <span className="text-amber-300">|</span>
                <div className="inline-flex items-center gap-1">
                  {studentBadges.diamonds > 0 && <span title={`${studentBadges.diamonds} Diamond Badges`}>💎{studentBadges.diamonds}</span>}
                  {studentBadges.gold > 0 && <span title={`${studentBadges.gold} Gold Badges`}>🥇{studentBadges.gold}</span>}
                  {studentBadges.silver > 0 && <span title={`${studentBadges.silver} Silver Badges`}>🥈{studentBadges.silver}</span>}
                  {studentBadges.copper > 0 && <span title={`${studentBadges.copper} Copper Badges`}>🥉{studentBadges.copper}</span>}
                  {studentBadges.iron > 0 && <span title={`${studentBadges.iron} Iron Badges`}>⚙️{studentBadges.iron}</span>}
                  {studentBadges.badges.length === 0 && <span className="text-[10px] text-amber-700 font-normal">Level 0</span>}
                </div>
              </div>
            )}
            <span
              className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                role === 'ADMIN'
                  ? 'bg-amber-100 text-amber-800 border border-amber-300'
                  : role === 'STUDENT'
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                  : 'bg-blue-100 text-blue-800 border border-blue-300'
              }`}
            >
              {role === 'ADMIN'
                ? 'Committee Member'
                : role === 'STUDENT'
                ? 'Enrolled Student'
                : 'Faculty Supervisor'}
            </span>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 p-8 overflow-y-auto print:p-0 print:overflow-visible">{children}</main>
      </div>
    </div>
  );
}

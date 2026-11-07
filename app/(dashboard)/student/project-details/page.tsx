import { getStudentProjectDetailsAction } from '@/app/actions/student-project';
import StudentProjectDetailsClient from './project-details-client';

export const dynamic = 'force-dynamic';

export default async function StudentProjectDetailsPage() {
  const result = await getStudentProjectDetailsAction();

  return (
    <StudentProjectDetailsClient
      initialData={result.data || null}
      error={result.error || null}
    />
  );
}

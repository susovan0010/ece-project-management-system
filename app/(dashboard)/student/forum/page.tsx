import { Metadata } from 'next';
import { getGroupForumDataAction } from '@/app/actions/forum';
import ForumView from '@/components/forum/forum-view';

export const metadata: Metadata = {
  title: 'Group Forum Discussion | Student Portal',
  description: 'Collaborative technical discussion forum between group members and the supervisor.',
};

export default async function StudentForumPage() {
  const res = await getGroupForumDataAction();

  if (!res.success || !res.data) {
    return (
      <div className="max-w-2xl mx-auto mt-12 bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-4 shadow-sm">
        <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto text-xl">
          ⚠️
        </div>
        <h2 className="text-lg font-bold text-slate-900">Project Group Forum Unavailable</h2>
        <p className="text-xs text-slate-600 leading-relaxed max-w-md mx-auto">
          {res.error || 'You have not been allocated to an active project group yet.'}
        </p>
      </div>
    );
  }

  return <ForumView initialData={res.data} />;
}

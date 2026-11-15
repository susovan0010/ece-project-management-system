import type { BatchDeadlines } from '@/app/actions/system-health';

function formatCountdown(dateStr: string): { label: string; urgent: boolean; overdue: boolean } {
  const target = new Date(`${dateStr}T23:59:59`);
  if (isNaN(target.getTime())) return { label: dateStr, urgent: false, overdue: false };
  const diffDays = Math.ceil((target.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return { label: `${Math.abs(diffDays)}d overdue`, urgent: true, overdue: true };
  if (diffDays === 0) return { label: 'Due today', urgent: true, overdue: false };
  if (diffDays <= 5) return { label: `${diffDays}d left`, urgent: true, overdue: false };
  return { label: `${diffDays}d left`, urgent: false, overdue: false };
}

export default function BatchDeadlineBanner({
  batchId,
  deadlines,
}: {
  batchId: string | null;
  deadlines: BatchDeadlines | null;
}) {
  if (!batchId || !deadlines) return null;

  const items: Array<{ name: string; date: string }> = [];
  if (deadlines.topicSelection) items.push({ name: 'Topic Selection', date: deadlines.topicSelection });
  if (deadlines.sem7Panel) items.push({ name: 'Sem 7 Panel', date: deadlines.sem7Panel });
  if (deadlines.sem8Marks) items.push({ name: 'Sem 8 Marks', date: deadlines.sem8Marks });

  if (items.length === 0 && !deadlines.note) return null;

  return (
    <div className="no-print print:hidden bg-indigo-50 border-b border-indigo-200 px-4 md:px-6 py-2 text-xs text-indigo-950 flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-bold text-indigo-800 uppercase tracking-wider text-[11px]">
          📅 Batch {batchId} Deadlines:
        </span>
        {items.map((item) => {
          const cd = formatCountdown(item.date);
          return (
            <span
              key={item.name}
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md font-semibold border ${
                cd.overdue
                  ? 'bg-red-100 text-red-800 border-red-300'
                  : cd.urgent
                  ? 'bg-amber-100 text-amber-900 border-amber-300'
                  : 'bg-white text-indigo-900 border-indigo-200'
              }`}
            >
              <span>{item.name}:</span>
              <span className="font-mono">{item.date}</span>
              <span className="text-[10px] opacity-80">({cd.label})</span>
            </span>
          );
        })}
      </div>
      {deadlines.note && (
        <span className="text-[11px] font-medium text-indigo-800">
          Notice: {deadlines.note}
        </span>
      )}
    </div>
  );
}

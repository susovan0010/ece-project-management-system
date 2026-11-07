import { Metadata } from 'next';
import EvaluationRubricsView from '@/components/evaluation-rubrics-view';

export const metadata: Metadata = {
  title: 'Printable Evaluation Rubrics | Project Committee Admin',
  description: 'Official printable project evaluation sheets and rubric criteria for B.Tech ECE.',
};

export default function AdminRubricsPage() {
  return <EvaluationRubricsView role="ADMIN" />;
}

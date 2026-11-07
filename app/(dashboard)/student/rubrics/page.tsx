import { Metadata } from 'next';
import EvaluationRubricsView from '@/components/evaluation-rubrics-view';

export const metadata: Metadata = {
  title: 'Evaluation Rubrics & Marks Distribution | Student Portal',
  description:
    'Detailed semester-wise project evaluation rubrics showing marks distribution between supervisor and panellists / examiners.',
};

export default function StudentRubricsPage() {
  return <EvaluationRubricsView role="STUDENT" />;
}

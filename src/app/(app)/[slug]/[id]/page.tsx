import { notFound } from 'next/navigation';
import { definitionBySlug } from '@/lib/records/definitions';
import { RecordDetailScreen } from './record-detail-screen';

export default async function RecordDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const definition = definitionBySlug(slug);
  if (!definition) notFound();

  return <RecordDetailScreen slug={definition.slug} id={id} />;
}

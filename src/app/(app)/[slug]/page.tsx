import { notFound } from 'next/navigation';
import { ALL_DEFINITIONS, definitionBySlug } from '@/lib/records/definitions';
import { RecordListScreen } from './record-list-screen';

/**
 * One route for every record type.
 *
 * Next gives static segments precedence over dynamic ones, so /setup and
 * /unlock still reach their own pages while /contacts, /policies, and
 * /accounts land here. Adding a category means adding a definition — which is
 * the whole point of building this layer before the category screens.
 */
export function generateStaticParams() {
  return ALL_DEFINITIONS.map((definition) => ({ slug: definition.slug }));
}

export default async function RecordListPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const definition = definitionBySlug(slug);
  if (!definition) notFound();

  return <RecordListScreen slug={definition.slug} />;
}

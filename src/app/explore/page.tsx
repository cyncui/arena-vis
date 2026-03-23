import Arena3D from '@/components/Arena3D';

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<{ slug?: string }>;
}) {
  const params = await searchParams;
  const slug = params.slug || '';

  return <Arena3D initialSlug={slug} />;
}

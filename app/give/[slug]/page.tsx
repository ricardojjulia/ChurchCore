import { notFound } from "next/navigation";
import { PublicGivingPage } from "@/components/application/public-giving-page";

type GivingPageData = {
  churchName: string;
  headline: string;
  description: string | null;
  funds: string[];
  allowAnonymous: boolean;
  slug: string;
};

async function getGivingPageData(slug: string): Promise<GivingPageData | null> {
  // In production: query public_giving_pages by slug via the platform Supabase client.
  // Returning null triggers notFound(). This scaffold is ready for that query.
  void slug;
  return null;
}

export default async function PublicGivingRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await getGivingPageData(slug);

  if (!data) {
    notFound();
  }

  return <PublicGivingPage data={data} slug={slug} />;
}

export const dynamic = "force-dynamic";

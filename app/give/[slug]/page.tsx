import { notFound } from "next/navigation";
import { PublicGivingPage } from "@/components/application/public-giving-page";
import { getPublicGivingPage } from "@/lib/public-giving";

type GivingPageData = {
  churchName: string;
  headline: string;
  description: string | null;
  funds: string[];
  allowAnonymous: boolean;
  slug: string;
};

async function getGivingPageData(slug: string): Promise<GivingPageData | null> {
  // The church's live giving page (G3.1). The church id stays on the server;
  // the gift action looks the page up again by slug.
  const page = await getPublicGivingPage(slug);
  if (page) {
    return {
      churchName: page.churchName,
      headline: page.headline,
      description: page.description,
      funds: page.funds,
      allowAnonymous: page.allowAnonymous,
      slug: page.slug,
    };
  }

  // Demo mode: a page for any slug, so the demo's giving page is reachable.
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
    return {
      churchName: "Grace Harbor Church",
      headline: "Give to Grace Harbor",
      description: "Your generosity fuels ministry, serves the community, and changes lives.",
      funds: ["General Fund", "Building Fund", "Missions", "Youth Ministry"],
      allowAnonymous: true,
      slug,
    };
  }
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

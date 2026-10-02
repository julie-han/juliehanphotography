import { env } from "cloudflare:workers";

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map();

function buildImageUrl(publicId, format, version, width = 1600) {
  const cloudName = env.CLOUDINARY_CLOUD_NAME;
  return `https://res.cloudinary.com/${cloudName}/image/upload/f_auto,q_auto,w_${width}/v${version}/${publicId}.${format}`;
}

async function searchByExpression(expression) {
  const cloudName = env.CLOUDINARY_CLOUD_NAME;
  const apiKey = env.CLOUDINARY_API_KEY;
  const apiSecret = env.CLOUDINARY_API_SECRET;

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/resources/search`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${apiKey}:${apiSecret}`)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        expression,
        with_field: ["context"],
        max_results: 100,
      }),
    }
  );

  if (!response.ok) {
    console.error(
      `Cloudinary search failed for expression "${expression}": ${response.status} ${await response.text()}`
    );
    return [];
  }

  const { resources } = await response.json();
  return resources ?? [];
}

function resourcesToImages(resources, defaultAlt) {
  return resources
    .map((resource) => {
      const context = resource.context?.custom ?? {};
      const order = Number(context.order);

      return {
        src: buildImageUrl(resource.public_id, resource.format, resource.version),
        alt: context.alt || defaultAlt,
        orientation:
          resource.height > resource.width ? "portrait" : "landscape",
        order: Number.isFinite(order) ? order : Infinity,
        publicId: resource.public_id,
      };
    })
    .sort((a, b) => a.order - b.order || a.publicId.localeCompare(b.publicId));
}

async function fetchResources(expression) {
  const cached = cache.get(expression);
  const now = Date.now();

  if (cached && cached.expiresAt > now) {
    return cached.resources;
  }

  const resources = await searchByExpression(expression);
  cache.set(expression, { resources, expiresAt: now + CACHE_TTL_MS });
  return resources;
}

/**
 * Fetches images tagged with the given gallery tag from Cloudinary,
 * sorted by the "order" context metadata set per-image in the console.
 *
 * If `featuredTag` is given, images that also carry that tag are
 * preferred (in "order" among themselves) and take the front slots,
 * falling back to the regular gallery order to fill any remaining
 * slots up to `limit`. This lets specific images be pinned to a
 * preview (e.g. the home page) without changing the full gallery order.
 */
export async function getGalleryImages(
  tag,
  { limit, defaultAlt = "Photography", featuredTag, byFolder = false } = {}
) {
  const baseExpression = byFolder ? `folder=${tag}` : `tags=${tag}`;
  const resources = await fetchResources(baseExpression);
  const images = resourcesToImages(resources, defaultAlt);

  if (!featuredTag) {
    return typeof limit === "number" ? images.slice(0, limit) : images;
  }

  const featuredResources = await fetchResources(
    `${baseExpression} AND tags=${featuredTag}`
  );
  const featuredImages = resourcesToImages(featuredResources, defaultAlt);
  const featuredIds = new Set(featuredImages.map((image) => image.publicId));
  const rest = images.filter((image) => !featuredIds.has(image.publicId));
  const ordered = [...featuredImages, ...rest];

  return typeof limit === "number" ? ordered.slice(0, limit) : ordered;
}

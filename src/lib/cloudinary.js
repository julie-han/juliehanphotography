const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map();

function buildImageUrl(publicId, format, width = 1600) {
  const cloudName = import.meta.env.CLOUDINARY_CLOUD_NAME;
  return `https://res.cloudinary.com/${cloudName}/image/upload/f_auto,q_auto,w_${width}/${publicId}.${format}`;
}

async function searchByTag(tag) {
  const cloudName = import.meta.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = import.meta.env.CLOUDINARY_API_KEY;
  const apiSecret = import.meta.env.CLOUDINARY_API_SECRET;

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/resources/search`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${apiKey}:${apiSecret}`)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        expression: `tags=${tag}`,
        with_field: ["context"],
        max_results: 100,
      }),
    }
  );

  if (!response.ok) {
    console.error(
      `Cloudinary search failed for tag "${tag}": ${response.status} ${await response.text()}`
    );
    return [];
  }

  const { resources } = await response.json();
  return resources ?? [];
}

/**
 * Fetches images tagged with the given gallery tag from Cloudinary,
 * sorted by the "order" context metadata set per-image in the console.
 */
export async function getGalleryImages(
  tag,
  { limit, defaultAlt = "Photography" } = {}
) {
  const cached = cache.get(tag);
  const now = Date.now();

  let resources;
  if (cached && cached.expiresAt > now) {
    resources = cached.resources;
  } else {
    resources = await searchByTag(tag);
    cache.set(tag, { resources, expiresAt: now + CACHE_TTL_MS });
  }

  const images = resources
    .map((resource) => {
      const context = resource.context?.custom ?? {};
      const order = Number(context.order);

      return {
        src: buildImageUrl(resource.public_id, resource.format),
        alt: context.alt || defaultAlt,
        orientation:
          resource.height > resource.width ? "portrait" : "landscape",
        order: Number.isFinite(order) ? order : Infinity,
        publicId: resource.public_id,
      };
    })
    .sort((a, b) => a.order - b.order || a.publicId.localeCompare(b.publicId));

  return typeof limit === "number" ? images.slice(0, limit) : images;
}

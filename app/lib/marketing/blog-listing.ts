/**
 * Dérivation de la liste du blog depuis le registre des billets.
 *
 * BUG-MKT-011 — la page `/blog` et les pages d'article `/blog/:slug` étaient
 * alimentées par DEUX sources distinctes : une liste codée en dur dans le
 * composant (sans champ `slug`, donc structurellement impossible à lier) et le
 * registre qui sert réellement les articles. Conséquence : chaque lien
 * « Read more » portait `href="/blog"` et ramenait à la page qu'on lisait déjà,
 * tandis que les articles réellement servis n'étaient listés nulle part.
 *
 * Ce module rend le registre source unique. Une divergence redevient
 * impossible : ce qui est listé est exactement ce qui est servi.
 */

/** Ce que le registre fournit, réduit à ce dont la liste a besoin. */
export interface BlogRegistryPost {
  title: string;
  slug: string;
  excerpt: string;
  category: string;
  author: string;
  coverImage: string;
  readTime: number;
  published: boolean;
  featured: boolean;
  publishedAt: string;
}

export interface BlogListingPost {
  slug: string;

  /** Destination réelle de l'article — jamais la page de liste. */
  href: string;
  title: string;
  excerpt: string;
  category: string;
  author: string;
  coverImage: string;
  readTime: number;

  /** Date déjà formatée : le composant n'a pas à connaître la locale. */
  date: string;
}

export interface BlogListing {
  featured: BlogListingPost | null;
  posts: BlogListingPost[];
  categories: string[];
}

export const ALL_CATEGORIES = 'All';

/**
 * Formate une date de publication.
 *
 * La locale est FIXÉE plutôt que laissée à l'environnement : un rendu serveur
 * et un rendu client qui ne s'accordent pas sur la locale produisent deux
 * chaînes différentes, donc une erreur d'hydratation.
 */
export function formatPublishedAt(iso: string): string {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

function toListingPost(post: BlogRegistryPost): BlogListingPost {
  return {
    slug: post.slug,
    href: `/blog/${post.slug}`,
    title: post.title,
    excerpt: post.excerpt,
    category: post.category,
    author: post.author,
    coverImage: post.coverImage,
    readTime: post.readTime,
    date: formatPublishedAt(post.publishedAt),
  };
}

export function buildBlogListing(registry: readonly BlogRegistryPost[]): BlogListing {
  const published = registry
    .filter((post) => post.published && post.slug)
    .slice()
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

  /*
   * Le plus récent sert de vedette si aucun billet n'est explicitement marqué :
   * une page « Featured » vide serait un trou visible là où du contenu existe.
   */
  const featured = published.find((post) => post.featured) ?? published[0] ?? null;
  const rest = published.filter((post) => post !== featured);

  /*
   * Les catégories sont DÉRIVÉES des billets listés. Une liste écrite à la main
   * finit par proposer un filtre qui ne renvoie rien — un cul-de-sac silencieux
   * pour le lecteur.
   */
  const categories = [ALL_CATEGORIES, ...[...new Set(rest.map((post) => post.category))].sort()];

  return { featured: featured ? toListingPost(featured) : null, posts: rest.map(toListingPost), categories };
}

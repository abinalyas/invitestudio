// Shared design data and small components from the Figma Make export (App.tsx lines 1-316).
// Adapted only by exporting names; see figma/source/src/App.tsx for the original.

export type IconName = "arrow" | "calendar" | "check" | "chevron" | "clock" | "cloud" | "device" | "edit" | "eye" | "gallery" | "grid" | "heart" | "home" | "layers" | "link" | "pin" | "people" | "play" | "search" | "send" | "sparkle" | "user"

export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  }

  const paths: Record<IconName, React.ReactNode> = {
    arrow: (
      <>
        <path d="M5 12h13" />
        <path d="m14 8 4 4-4 4" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    chevron: <path d="m7 9 5 5 5-5" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    cloud: (
      <path d="M17.5 19H7a5 5 0 1 1 1.2-9.8A7 7 0 0 1 21 12.5 3.5 3.5 0 0 1 17.5 19Z" />
    ),
    device: (
      <>
        <rect x="6" y="2" width="12" height="20" rx="2" />
        <path d="M11 18h2" />
      </>
    ),
    edit: (
      <>
        <path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z" />
        <path d="m14 7 3 3" />
      </>
    ),
    eye: (
      <>
        <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
        <circle cx="12" cy="12" r="2.5" />
      </>
    ),
    gallery: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <circle cx="8" cy="9" r="1.5" />
        <path d="m5 18 5-5 3 3 2-2 4 4" />
      </>
    ),
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    heart: (
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />
    ),
    home: (
      <>
        <path d="m3 11 9-8 9 8" />
        <path d="M5 10v11h14V10M9 21v-7h6v7" />
      </>
    ),
    layers: (
      <>
        <path d="m12 2 9 5-9 5-9-5 9-5Z" />
        <path d="m3 12 9 5 9-5M3 17l9 5 9-5" />
      </>
    ),
    link: (
      <>
        <path d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" />
        <path d="M14 11a5 5 0 0 0-7.1 0l-2 2A5 5 0 0 0 12 20.1l1.1-1.1" />
      </>
    ),
    people: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />
      </>
    ),
    pin: (
      <>
        <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="2.5" />
      </>
    ),
    play: <path d="m9 7 8 5-8 5V7Z" fill="currentColor" stroke="none" />,
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    send: (
      <>
        <path d="m22 2-7 20-4-9-9-4 20-7Z" />
        <path d="M22 2 11 13" />
      </>
    ),
    sparkle: (
      <>
        <path d="M12 3c.5 4.7 2.8 7 7 7-4.2 0-6.5 2.3-7 7-.5-4.7-2.8-7-7-7 4.2 0 6.5-2.3 7-7Z" />
        <path d="M19 16c.2 2.2 1.3 3.3 3 3.5-1.7.2-2.8 1.3-3 3.5-.2-2.2-1.3-3.3-3-3.5 1.7-.2 2.8-1.3 3-3.5Z" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 22a8 8 0 0 1 16 0" />
      </>
    ),
  }

  return <svg {...common}>{paths[name]}</svg>
}

export const templates = [
  {
    names: "Aisha & Rohan",
    image:
      "https://images.unsplash.com/photo-1612538946625-382e2c4a1da3?auto=format&fit=crop&w=900&q=85",
  },
  {
    names: "Meera & Arjun",
    image:
      "https://images.unsplash.com/photo-1572973304710-1f646f145fba?auto=format&fit=crop&w=900&q=85",
  },
  {
    names: "Diya & Karthik",
    image:
      "https://images.unsplash.com/photo-1774093280188-5114e6a6a3e3?auto=format&fit=crop&w=900&q=85",
  },
  {
    names: "Ananya & Vivek",
    image:
      "https://images.unsplash.com/photo-1770394944750-a48252e7ba7a?auto=format&fit=crop&w=900&q=85",
  },
]

export const plans = [
  {
    name: "Free",
    subtitle: "Get started and try the basics.",
    monthly: 0,
    yearly: 0,
    features: [
      "Access to free templates",
      "Create 1 wedding website",
      "Basic customisation",
    ],
  },
  {
    name: "Pro",
    subtitle: "All the essentials for a beautiful wedding website.",
    monthly: 199,
    yearly: 1999,
    featured: true,
    features: [
      "Premium templates",
      "Custom domain (optional)",
      "Event details & travel information",
      "Photo gallery & more",
    ],
  },
  {
    name: "Pro+",
    subtitle: "For a truly personalised experience.",
    monthly: 299,
    yearly: 2999,
    features: [
      "Everything in Pro",
      "Advanced customisation",
      "Priority support",
    ],
  },
]

export const faqs = [
  [
    "Do I need any technical skills to create a wedding website?",
    "Not at all. Pick a template, add your details, and publish in a few simple steps.",
  ],
  [
    "Can I collect RSVPs from my guests?",
    "Not yet. Online RSVPs are not available. Your invitation can show your events, directions and travel details today.",
  ],
  [
    "Can I customise the design and content?",
    "Yes. You can update colours, fonts, photos, event details, and page sections.",
  ],
  [
    "Can I use my own domain?",
    "Yes. Custom domains are available on paid plans, or you can use your free InviteStudio link.",
  ],
]

export function Logo() {
  return (
    <a href="/" className="logo" aria-label="InviteStudio home">
      <span className="logo-mark">
        <i />
        <i />
        <i />
        <i />
      </span>
      <span>InviteStudio</span>
    </a>
  )
}

export const galleryTemplates = [
  {
    id: 1,
    title: "Forest Elegance",
    names: "Aisha & Rohan",
    tags: ["Floral", "Modern"],
    popularity: 98,
    image:
      "https://images.unsplash.com/photo-1612538946625-382e2c4a1da3?auto=format&fit=crop&w=900&q=85",
  },
  {
    id: 2,
    title: "Kerala Traditions",
    names: "Meera & Arjun",
    tags: ["Traditional", "Regional"],
    popularity: 94,
    image:
      "https://images.unsplash.com/photo-1572973304710-1f646f145fba?auto=format&fit=crop&w=900&q=85",
  },
  {
    id: 3,
    title: "Spring Blossom",
    names: "Diya & Karthik",
    tags: ["Floral", "Romantic"],
    popularity: 91,
    image:
      "https://images.unsplash.com/photo-1774093280188-5114e6a6a3e3?auto=format&fit=crop&w=900&q=85",
  },
  {
    id: 4,
    title: "Evening Soirée",
    names: "Ananya & Vivek",
    tags: ["Modern", "Elegant"],
    popularity: 89,
    image:
      "https://images.unsplash.com/photo-1770394944750-a48252e7ba7a?auto=format&fit=crop&w=900&q=85",
  },
  {
    id: 5,
    title: "Coastal Romance",
    names: "Rhea & Ishan",
    tags: ["Destination", "Minimal"],
    popularity: 86,
    image:
      "https://images.unsplash.com/photo-1571043281665-9debfed10719?auto=format&fit=crop&w=900&q=85",
  },
  {
    id: 6,
    title: "Modern Minimal",
    names: "Nandini & Karan",
    tags: ["Minimal", "Elegant"],
    popularity: 82,
    image:
      "https://images.unsplash.com/photo-1599366279015-524df1ed5d5c?auto=format&fit=crop&w=900&q=85",
  },
  {
    id: 7,
    title: "Lotus Reverie",
    names: "Sowmya & Adith",
    tags: ["Traditional", "Floral"],
    popularity: 79,
    image:
      "https://images.unsplash.com/photo-1599559564334-5810cb49934a?auto=format&fit=crop&w=900&q=85",
  },
  {
    id: 8,
    title: "Destination Hills",
    names: "Elena & Mark",
    tags: ["Modern", "Destination"],
    popularity: 76,
    image:
      "https://images.unsplash.com/photo-1764145045070-02d766d3ad4f?auto=format&fit=crop&w=900&q=85",
  },
]

export const styleOptions = [
  ["Traditional", 12],
  ["Modern", 10],
  ["Floral", 10],
  ["Minimal", 7],
  ["Regional", 6],
  ["Destination", 5],
] as const


// Figma design id -> active backend template id. Every target is a frontend catalogue
// entry and is seeded in supabase/migrations (see docs/PHASE_0_INTEGRATION_PLAN.md).
// Kerala Traditions has no regional design in the catalogue, so it uses the closest
// classic design; the backend list is the only place to change this mapping.
export const backendTemplateIds: Record<number, string> = {
  1: "romantic-garden-wedding",      // Forest Elegance (Floral, Modern)
  2: "ivory-heirloom",               // Kerala Traditions (Traditional, Regional)
  3: "soft-pastels-wedding",         // Spring Blossom (Floral, Romantic)
  4: "black-tie-wedding",            // Evening Soiree (Modern, Elegant)
  5: "destination-wedding",          // Coastal Romance (Destination, Minimal)
  6: "modern-minimal-wedding",       // Modern Minimal (Minimal, Elegant)
  7: "contemporary-floral-wedding",  // Lotus Reverie (Traditional, Floral)
  8: "contemporary-editorial-wedding" // Destination Hills (Modern, Destination)
};

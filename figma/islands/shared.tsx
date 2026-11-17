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

export const faqs = [
  [
    "Do I need any technical skills to create a wedding website?",
    "Not at all. Pick a template, add your details, and publish in a few simple steps.",
  ],
  [
    "Can I collect RSVPs from my guests?",
    "Yes. Once your invitation is live, guests can reply from it with their name, whether they are coming and how many, and you see every reply in your editor and can download them as a spreadsheet. You can also switch replies off and ask guests to contact you instead.",
  ],
  [
    "Can I customise the design and content?",
    "Yes. You can update colours, fonts, photos, event details, and page sections.",
  ],
  [
    "How much does it cost?",
    "Building and previewing your invitation is free. You pay once, when you publish, and the price depends on the design you choose and where you are. See Pricing above; the price is shown before you pay, and there is no subscription.",
  ],
  [
    "Can I use my own domain?",
    "Not yet. Every invitation gets its own InviteStudio link that you can share with your guests.",
  ],
]

// A date or time field opens its picker wherever it is clicked, not only on the small calendar icon at its edge (Chrome and Edge
// open the picker from the icon only). Keyboard use is unchanged: tabbing into the field does not open it, and the day, month and
// year can still be typed. Where the browser has no showPicker, the field behaves as before.
export function openPickerOnClick(event: { currentTarget: HTMLInputElement }) {
  const field = event.currentTarget
  if (field.disabled || field.readOnly) return
  try { field.showPicker?.() } catch { /* the browser would not open it now: the field still works by typing */ }
}

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

// The templates offered now. The facts below come from the template catalogue in index.html; change them together.
export type GalleryTemplate = {
  id: number // the number in /templates/<id>
  backendId: string // the template id saved with a wedding (public.templates.id)
  title: string
  names: string // the example names on the template's cover; a new draft starts with them
  tagline: string
  tags: string[]
  opening: { name: string; text: string }
  palette: string[]
  image: string // artwork for the gallery cards
  phone: string // the real cover, phone shaped (npm run thumbs:scenes)
}

// The small (320 px wide) version of a template's phone picture, for places that show it at about 160 px.
// The build id (see scripts/stamp-build.mjs) goes on each picture address, so a new deploy never shows a cached older picture.
const buildId = typeof document !== "undefined" ? document.querySelector('meta[name="invitestudio-build"]')?.getAttribute("content") : ""
import { places } from "./places"

// A hidden list of suggestions that a text input picks up with list="invitestudio-places". It has to sit in the same screen as the input.
export function PlaceList() {
  return (
    <datalist id="invitestudio-places">
      {places.map((place) => (
        <option key={place} value={place} />
      ))}
    </datalist>
  )
}

export const art = (path: string) => (buildId ? `${path}?v=${buildId}` : path)
export const phoneSmall = (path: string) => path.replace(/-phone\.jpg(\?.*)?$/, (_m, q) => "-phone-sm.webp" + (q || ""))

export const galleryTemplates: GalleryTemplate[] = [
  {
    id: 13,
    backendId: "modern-heritage",
    title: "Modern Heritage",
    names: "Daniel & Amelia",
    tagline: "Ivory paper, deep green and gold botanical details, with a live countdown to the day.",
    tags: ["Classic", "Heritage"],
    opening: {
      name: "Countdown",
      text: "The cover shows your crest and a live countdown to your date. Guests scroll through your story, details and schedule.",
    },
    palette: ["#f4eedf", "#a58b62", "#34493a"],
    image: art("/assets/templates/modern-heritage-wide.jpg"),
    phone: art("/assets/templates/modern-heritage-phone.jpg"),
  },
  {
    id: 14,
    backendId: "minimalist",
    title: "Minimalist",
    names: "Daniel & Amelia",
    tagline: "Quiet editorial layout: large serif names, one olive accent and plenty of space.",
    tags: ["Modern", "Editorial"],
    opening: {
      name: "Countdown",
      text: "A calm cover with your names set large and a live countdown to your date. Guests scroll through your story, the day and the schedule.",
    },
    palette: ["#faf9f6", "#5c6350", "#292929"],
    image: art("/assets/templates/minimalist-wide.jpg"),
    phone: art("/assets/templates/minimalist-phone.jpg"),
  },
  {
    id: 15,
    backendId: "cinematic",
    title: "Cinematic",
    names: "Daniel & Amelia",
    tagline: "A dark, film-like invitation: big names, a golden countdown and quiet scenes.",
    tags: ["Modern", "Cinematic"],
    opening: {
      name: "Countdown",
      text: "A dark cover with your names set large and a live countdown to your date. Guests scroll through your story, the day and the schedule.",
    },
    palette: ["#171615", "#b59a72", "#f5f0e8"],
    image: art("/assets/templates/cinematic-wide.jpg"),
    phone: art("/assets/templates/cinematic-phone.jpg"),
  },
  {
    id: 16,
    backendId: "fairy-tale",
    title: "Fairy Tale",
    names: "Daniel & Amelia",
    tagline: "A pink sunset sky, a castle on the hill and script lettering: once upon a time, with a countdown to forever.",
    tags: ["Romantic", "Storybook"],
    opening: {
      name: "Countdown",
      text: "A storybook cover with your names in script and a live countdown to your date. Guests scroll through your story and your events.",
    },
    palette: ["#fff9f4", "#855b6c", "#59494a"],
    image: art("/assets/templates/fairy-tale-wide.jpg"),
    phone: art("/assets/templates/fairy-tale-phone.jpg"),
  },
  {
    id: 18,
    backendId: "bloom-reveal",
    title: "Bloom Reveal",
    names: "Meera & Abin",
    tagline: "A watercolour border of peonies and roses that blooms in from the corners, with a live countdown and soft script lettering.",
    tags: ["Botanical", "Romantic"],
    opening: {
      name: "Bloom reveal",
      text: "Watercolour flowers bloom in from the corners around your names, then a countdown to your date. Guests scroll through your story, your events and a reply button.",
    },
    palette: ["#fbf1e3", "#485c48", "#4a403a"],
    image: art("/assets/templates/bloom-reveal-wide.jpg"),
    phone: art("/assets/templates/bloom-reveal-phone.jpg"),
  },
  {
    id: 19,
    backendId: "velvet-reveal",
    title: "Velvet Reveal",
    names: "Isabel & Julian",
    tagline: "Emerald velvet curtains part on a full-screen opening, then a gold foil to scratch away to find the date.",
    tags: ["Cinematic", "Romantic"],
    opening: {
      name: "Velvet curtains",
      text: "A full-screen video of velvet curtains parting, with an Open Invitation button. Then your names in an arch, a gold foil to scratch for the date, a countdown, your story and your events.",
    },
    palette: ["#0b2119", "#d6b77a", "#f6f0e5"],
    image: art("/assets/templates/velvet-reveal-wide.jpg"),
    phone: art("/assets/templates/velvet-reveal-phone.jpg"),
  },
  {
    id: 20,
    backendId: "under-the-same-moon",
    title: "Under the Same Moon",
    names: "Naomi & Rafael",
    tagline: "A moonlit lake under a slowly turning moon, a gold foil to scratch for the date, and a lantern-lit story.",
    tags: ["Celestial", "Romantic"],
    opening: {
      name: "Moonlit sky",
      text: "A short film of the night sky opens the invitation. Then your names over a moonlit lake, a gold foil to scratch for the date, your story, your events and a countdown.",
    },
    palette: ["#090f25", "#c9ae83", "#f7f3ea"],
    image: art("/assets/templates/under-the-same-moon-wide.jpg"),
    phone: art("/assets/templates/under-the-same-moon-phone.jpg"),
  },
  {
    id: 21,
    backendId: "golden-butterfly",
    title: "Golden Butterfly",
    names: "Priya & Daniel",
    tagline: "A short film of golden butterflies opens a black-and-gold invitation, with floating butterflies and a countdown.",
    tags: ["Cinematic", "Romantic"],
    opening: {
      name: "Butterfly film",
      text: "A short film of golden butterflies plays first, then your names over gold light with butterflies drifting past, a countdown, your note, your venues on ivory paper and a reply button.",
    },
    palette: ["#090806", "#c7a56a", "#f2eadb"],
    image: art("/assets/templates/golden-butterfly-wide.jpg"),
    phone: art("/assets/templates/golden-butterfly-phone.jpg"),
  },
  {
    id: 22,
    backendId: "cherry-blossom",
    title: "Cherry Blossom",
    names: "Hannah & Theo",
    tagline: "A short film of blossom, petals falling past your names, and a date to uncover with three taps and a soft chime.",
    tags: ["Botanical", "Romantic"],
    opening: {
      name: "Blossom film",
      text: "A short film of blossom plays first. Then petals fall past your names, guests tap three blossoms to uncover the date, and scroll through your story, the day, a countdown and a reply button.",
    },
    palette: ["#fff9f2", "#57433c", "#d68f96"],
    image: art("/assets/templates/cherry-blossom-wide.jpg"),
    phone: art("/assets/templates/cherry-blossom-phone.jpg"),
  },
  {
    id: 23,
    backendId: "lantern-night",
    title: "Lantern Night",
    names: "Meera & Abin",
    tagline: "A film of a thousand floating lanterns plays behind the whole invitation, lanterns rise past your names, and the date waits under dark gold foil.",
    tags: ["Cinematic", "Romantic"],
    opening: {
      name: "Lantern film",
      text: "A short film of floating lanterns opens the invitation and keeps playing softly behind every section. Lanterns rise past your names, guests scratch a dark gold foil to find the date, then scroll through your story, the celebration, a countdown and a reply button.",
    },
    palette: ["#17172d", "#ffe1ad", "#c69b62"],
    image: art("/assets/templates/lantern-night-wide.jpg"),
    phone: art("/assets/templates/lantern-night-phone.jpg"),
  },
]

// What a couple can change on any of these templates, and what guests see. Taken from the editor
// and from scene-templates.js. Features that are not available yet are deliberately not listed.
export const editableItems = [
  "Names, date and location, with a map link",
  "A welcome message and who is hosting",
  "Your story, with your own title",
  "An event schedule: times, venues, dress code and directions",
  "Show or hide any section",
  "Publish at your own web address",
] as const

export const guestSections = [
  "Cover with your names and date",
  "Welcome and venue",
  "Your story (when you add one)",
  "Schedule (when you add events)",
  "Save the date",
] as const

// Style filters for the gallery: each template's main style (its first tag), counted.
export const styleOptions: [string, number][] = Object.entries(
  galleryTemplates
    .map((template) => template.tags[0])
    .reduce<Record<string, number>>((counts, tag) => ({ ...counts, [tag]: (counts[tag] ?? 0) + 1 }), {}),
)

// Template number -> the template id saved with the wedding. Each id is a row in public.templates
// (supabase/migrations/202611070001_scene_templates.sql) and is allowed in functions/_shared/templates.js.
export const backendTemplateIds: Record<number, string> = Object.fromEntries(
  galleryTemplates.map((template) => [template.id, template.backendId]),
)

// Ready-written wording the couple can start from and then change. Nothing is saved until they pick one and it is theirs to edit.
// Written in "we" so it reads naturally whoever the couple are; the hosts line uses the names they entered.
export type Sample = { label: string; text: string }

export function sampleWelcomes(): Sample[] {
  return [
    { label: "Warm", text: "Together with our families, we invite you to celebrate the beginning of our forever." },
    { label: "Short and simple", text: "Join us for our wedding. We can't wait to celebrate with you!" },
    { label: "Traditional", text: "With joy and the blessings of our families, we request the pleasure of your company at our wedding." },
  ]
}

export function sampleStories(): Sample[] {
  return [
    {
      label: "How we met",
      text: "We met by chance and became friends before we knew it. Years of laughter, long walks and shared dreams later, we are getting married. We would love for you to be there as we begin this next chapter together.",
    },
    {
      label: "Short",
      text: "It started with a simple hello, and every day since has been our favourite. Now we are getting married, and there is no one we would rather celebrate with than you.",
    },
    {
      label: "Families",
      text: "Two families, one celebration. After years of friendship and adventure, we have decided to spend our lives together. Please join us as we say \"I do\", surrounded by the people we love most.",
    },
  ]
}

export function sampleHosts(names: string): Sample[] {
  const parts = names.split(/\s*(?:&|\band\b|\+)\s*/i).map((part) => part.trim()).filter(Boolean)
  const couple = parts.length > 1 ? `${parts[0]} and ${parts[1]}` : parts[0] || "the couple"
  return [
    { label: "Families", text: `Hosted by the families of ${couple}` },
    { label: "Simple", text: `With love, ${parts.length > 1 ? `${parts[0]} & ${parts[1]}` : couple}` },
  ]
}

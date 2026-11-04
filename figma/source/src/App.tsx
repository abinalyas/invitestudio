import { useState } from "react"

type IconName = "arrow" | "calendar" | "check" | "chevron" | "clock" | "cloud" | "device" | "edit" | "eye" | "gallery" | "grid" | "heart" | "home" | "layers" | "link" | "pin" | "people" | "play" | "search" | "send" | "sparkle" | "user"

function Icon({ name, size = 22 }: { name: IconName size?: number }) {
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

const templates = [
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

const plans = [
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
      "RSVP & guest management",
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

const faqs = [
  [
    "Do I need any technical skills to create a wedding website?",
    "Not at all. Pick a template, add your details, and publish in a few simple steps.",
  ],
  [
    "Can I collect RSVPs from my guests?",
    "Yes. Guests can RSVP online, choose meals, and share dietary needs from any device.",
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

function Logo() {
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

const galleryTemplates = [
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

const styleOptions = [
  ["Traditional", 12],
  ["Modern", 10],
  ["Floral", 10],
  ["Minimal", 7],
  ["Regional", 6],
  ["Destination", 5],
] as const

function TemplateDetailPage({ templateId }: { templateId: number }) {
  const template =
    galleryTemplates.find((item) => item.id === templateId) ??
    galleryTemplates[0]
  const [activePage, setActivePage] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)

  const detailHero =
    template.id === 1
      ? "https://images.unsplash.com/photo-1785336872719-2e338088a4b6?auto=format&fit=crop&w=1600&q=90"
      : template.image
  const pagePreviews = [
    { label: "Home", image: detailHero },
    {
      label: "Our Story",
      image:
        "https://images.unsplash.com/photo-1633104502699-b2ecf0fee294?auto=format&fit=crop&w=700&q=80",
    },
    {
      label: "Events",
      image:
        "https://images.unsplash.com/photo-1710587384897-b1390bd46cc6?auto=format&fit=crop&w=700&q=80",
    },
    {
      label: "Gallery",
      image:
        "https://images.unsplash.com/photo-1754782921180-674165dec130?auto=format&fit=crop&w=700&q=80",
    },
    {
      label: "RSVP",
      image:
        "https://images.unsplash.com/photo-1599366279015-524df1ed5d5c?auto=format&fit=crop&w=700&q=80",
    },
    {
      label: "Travel",
      image:
        "https://images.unsplash.com/photo-1572973304710-1f646f145fba?auto=format&fit=crop&w=700&q=80",
    },
  ]
  const included = [
    ["layers", "Multi-section wedding website"],
    ["people", "RSVP with guest management"],
    ["calendar", "Event details (multiple functions)"],
    ["gallery", "Photo gallery"],
    ["pin", "Travel & stay information"],
    ["device", "Works on all devices"],
  ] as const

  return (
    <main className="detail-page">
      <header className="site-header gallery-shell gallery-header">
        <Logo />
        <button
          className="menu-button"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
        >
          <span />
          <span />
          <span />
        </button>
        <nav className={menuOpen ? "nav open" : "nav"}>
          <a className="active" href="/templates">
            Templates
          </a>
          <a href="/#features">Features</a>
          <a href="/#how">How it works</a>
          <a href="/#pricing">Pricing</a>
        </nav>
        <div className="header-actions">
          <a className="button small" href="/#pricing">
            Get started
          </a>
        </div>
      </header>

      <div className="detail-botanical detail-botanical-top">
        <i />
        <i />
        <i />
        <i />
      </div>
      <div className="detail-botanical detail-botanical-bottom">
        <i />
        <i />
        <i />
        <i />
      </div>

      <div className="gallery-shell detail-content">
        <nav className="detail-breadcrumb" aria-label="Breadcrumb">
          <a href="/templates">←</a>
          <a href="/templates">Templates</a>
          <span>›</span>
          <span>{template.title}</span>
        </nav>

        <div className="detail-layout">
          <div className="detail-showcase">
            <div className="site-preview">
              <img src={pagePreviews[activePage].image} alt="" />
              <span className="site-preview-shade" />
              <div className="site-preview-nav">
                <span>{template.names}</span>
                <div>
                  <span>Our Story</span>
                  <span>Events</span>
                  <span>Travel</span>
                  <span>RSVP</span>
                </div>
              </div>
              <div className="site-preview-copy">
                <small>The wedding of</small>
                <h1>{template.names.replace(" & ", "\n&\n")}</h1>
                <i />
                <p>24 AUG 2026</p>
                <span>KOCHI, KERALA</span>
              </div>
              <a
                className="preview-site-button"
                href={detailHero}
                target="_blank"
                rel="noreferrer"
              >
                <Icon name="play" size={17} /> Preview live site
              </a>
            </div>

            <section className="template-pages">
              <h2>Pages in this template</h2>
              <div className="page-thumbnails">
                {pagePreviews.map((page, index) => (
                  <button
                    className={activePage === index ? "active" : ""}
                    key={page.label}
                    onClick={() => setActivePage(index)}
                  >
                    <span>
                      <img src={page.image} alt="" />
                    </span>
                    {page.label}
                  </button>
                ))}
              </div>
            </section>
          </div>

          <aside className="detail-info">
            <span className="popular-badge">
              <Icon name="sparkle" size={17} /> Popular
            </span>
            <h1>{template.title}</h1>
            <p>
              A timeless and elegant design with thoughtful details, perfect for
              a modern celebration that feels uniquely yours.
            </p>
            <div className="detail-tags">
              {template.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
              <span>Elegant</span>
            </div>
            <div className="detail-actions">
              <button
                className="button"
                onClick={() => window.location.assign(`/editor/${template.id}`)}
              >
                <Icon name="edit" size={19} />
                Use this template
              </button>
              <a
                className="button outline"
                href={detailHero}
                target="_blank"
                rel="noreferrer"
              >
                <Icon name="eye" size={20} /> Live preview
              </a>
            </div>

            <div className="included-panel">
              <h2>What’s included</h2>
              <ul>
                {included.map(([icon, label]) => (
                  <li key={label}>
                    <Icon name={icon} size={23} />
                    <span>{label}</span>
                    <Icon name="check" size={19} />
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </main>
  )
}

function EditorPage({ templateId }: { templateId: number }) {
  const template =
    galleryTemplates.find((item) => item.id === templateId) ??
    galleryTemplates[0]
  const initialNames = template.names
  const [pages, setPages] = useState([
    ["home", "Home"],
    ["heart", "Our Story"],
    ["calendar", "Events"],
    ["gallery", "Gallery"],
    ["check", "RSVP"],
    ["pin", "Travel"],
  ] as Array<[IconName, string]>)
  const [activePage, setActivePage] = useState("Home")
  const [device, setDevice] = useState<"desktop" | "tablet" | "mobile">(
    "desktop",
  )
  const [pretitle, setPretitle] = useState("THE WEDDING OF")
  const [names, setNames] = useState(initialNames)
  const [date, setDate] = useState("24 Aug 2026")
  const [location, setLocation] = useState("Kochi, Kerala")
  const [buttonLabel, setButtonLabel] = useState("RSVP Now")
  const [storyTitle, setStoryTitle] = useState("Our Story")
  const [storyCopy, setStoryCopy] = useState(
    "Two friends, a shared journey and a love that grew along the way.",
  )
  const [heroImage, setHeroImage] = useState(
    template.id === 1
      ? "https://images.unsplash.com/photo-1785336872719-2e338088a4b6?auto=format&fit=crop&w=1600&q=90"
      : template.image,
  )
  const [saveState, setSaveState] = useState("Save")
  const [published, setPublished] = useState(false)

  const handleSave = () => {
    setSaveState("Saved")
    window.setTimeout(() => setSaveState("Save"), 1600)
  }

  const addPage = () => {
    const label = `Page ${pages.length + 1}`
    setPages((current) => [...current, ["layers", label]])
    setActivePage(label)
  }

  return (
    <main className="editor-page">
      <header className="editor-header">
        <div className="editor-brand">
          <Logo />
          <span className="editor-divider" />
          <strong>{names} Wedding</strong>
          <span className="draft-badge">
            {published ? "Published" : "Draft"}
          </span>
        </div>

        <div className="device-switcher" role="group" aria-label="Preview size">
          {(["desktop", "tablet", "mobile"] as const).map((mode) => (
            <button
              key={mode}
              className={device === mode ? "active" : ""}
              onClick={() => setDevice(mode)}
              aria-label={`${mode} preview`}
            >
              <span className={`device-shape ${mode}`} />
            </button>
          ))}
        </div>

        <div className="editor-header-actions">
          <a
            className="editor-action"
            href={`/templates/${template.id}`}
            target="_blank"
            rel="noreferrer"
          >
            <Icon name="eye" size={20} /> Preview
          </a>
          <button className="editor-action" onClick={handleSave}>
            <Icon name="cloud" size={20} /> {saveState}
          </button>
          <button
            className="editor-publish"
            onClick={() => setPublished(!published)}
          >
            {published ? "Published" : "Publish"}{" "}
            <Icon name={published ? "check" : "chevron"} size={17} />
          </button>
          <span className="editor-avatar">
            <Icon name="user" size={20} />
          </span>
        </div>
      </header>

      <div className="editor-workspace">
        <aside className="editor-pages">
          <div className="editor-panel-heading">
            <h2>Pages</h2>
            <button onClick={addPage}>＋ Add page</button>
          </div>
          <nav>
            {pages.map(([icon, label]) => (
              <button
                key={label}
                className={activePage === label ? "active" : ""}
                onClick={() => setActivePage(label)}
              >
                <Icon name={icon} size={22} />
                {label}
              </button>
            ))}
          </nav>
          <div className="editor-side-botanical">
            <i />
            <i />
            <i />
          </div>
        </aside>

        <section className="editor-canvas-area">
          <div className={`editor-browser ${device}`}>
            <div className="browser-bar">
              <span className="browser-dots">
                <i />
                <i />
                <i />
              </span>
              <span className="browser-address">
                ▣ {names.toLowerCase().replaceAll(" ", "-").replace("&-", "")}
                .invitestudio.in
              </span>
            </div>
            <div className="editor-site">
              <section
                className="editor-site-hero"
                style={{ backgroundImage: `url("${heroImage}")` }}
              >
                <span className="editor-site-shade" />
                <div className="editor-site-nav">
                  <span>{names}</span>
                  <div>
                    <span>Our Story</span>
                    <span>Events</span>
                    <span>Gallery</span>
                    <span>RSVP</span>
                    <span>Travel</span>
                  </div>
                </div>
                <div className="editor-site-copy">
                  <small>{pretitle}</small>
                  <h1>{names.replace(" & ", "\n&\n")}</h1>
                  <i />
                  <p>{date.toUpperCase()}</p>
                  <span>{location.toUpperCase()}</span>
                  <button>
                    <Icon name="calendar" size={18} /> {buttonLabel}
                  </button>
                </div>
              </section>
              <section className="editor-story-preview">
                <h2>{activePage === "Home" ? storyTitle : activePage}</h2>
                <i />
                <p>{storyCopy}</p>
                <div className="story-landscape" />
              </section>
            </div>
          </div>
        </section>

        <aside className="editor-controls">
          <h2>Edit content</h2>
          <div className="editing-note">
            <Icon name="edit" size={27} />
            <div>
              <strong>Content editing only</strong>
              <p>
                Your template design stays the same. Update your text, details
                and photos here.
              </p>
            </div>
          </div>

          <h3>
            {activePage} — {activePage === "Home" ? "Hero section" : "Section"}
          </h3>
          {activePage === "Home" ? (
            <div className="editor-form">
              <label>
                Pre-title
                <input
                  value={pretitle}
                  onChange={(event) => setPretitle(event.target.value)}
                />
              </label>
              <label>
                Couple names
                <input
                  value={names}
                  onChange={(event) => setNames(event.target.value)}
                />
              </label>
              <label>
                Date
                <span className="input-with-icon">
                  <Icon name="calendar" size={18} />
                  <input
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                  />
                </span>
              </label>
              <label>
                Location
                <span className="input-with-icon">
                  <Icon name="pin" size={18} />
                  <input
                    value={location}
                    onChange={(event) => setLocation(event.target.value)}
                  />
                </span>
              </label>
              <label>
                Button label
                <input
                  value={buttonLabel}
                  onChange={(event) => setButtonLabel(event.target.value)}
                />
              </label>
            </div>
          ) : (
            <div className="editor-form">
              <label>
                Section heading
                <input
                  value={storyTitle}
                  onChange={(event) => setStoryTitle(event.target.value)}
                />
              </label>
              <label>
                Description
                <textarea
                  value={storyCopy}
                  onChange={(event) => setStoryCopy(event.target.value)}
                  rows={4}
                />
              </label>
            </div>
          )}

          <div className="image-control">
            <strong>Hero image / background</strong>
            <div>
              <img src={heroImage} alt="" />
              <label>
                ↑ Replace image
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) setHeroImage(URL.createObjectURL(file))
                  }}
                />
              </label>
            </div>
          </div>
        </aside>
      </div>
    </main>
  )
}

function TemplatesPage() {
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState("popular")
  const [styles, setStyles] = useState<string[]>([])
  const [favorites, setFavorites] = useState<number[]>([])
  const [recent, setRecent] = useState<number[]>([2, 3, 5, 8])
  const [view, setView] = useState<"all" | "favorites" | "recent">("all")
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const toggleStyle = (style: string) => {
    setStyles((current) =>
      current.includes(style)
        ? current.filter((item) => item !== style)
        : [...current, style],
    )
  }

  const toggleFavorite = (id: number) => {
    setFavorites((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    )
  }

  const visibleTemplates = galleryTemplates
    .filter((template) => {
      const matchesSearch =
        `${template.title} ${template.names} ${template.tags.join(" ")}`
          .toLowerCase()
          .includes(query.toLowerCase())
      const matchesStyle =
        styles.length === 0 ||
        styles.some((style) => template.tags.includes(style))
      const matchesView =
        view === "all" ||
        (view === "favorites" && favorites.includes(template.id)) ||
        (view === "recent" && recent.includes(template.id))
      return matchesSearch && matchesStyle && matchesView
    })
    .sort((a, b) => {
      if (sort === "name") return a.title.localeCompare(b.title)
      if (sort === "newest") return b.id - a.id
      return b.popularity - a.popularity
    })

  return (
    <main className="gallery-page">
      <header className="site-header gallery-shell gallery-header">
        <Logo />
        <button
          className="menu-button"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
        >
          <span />
          <span />
          <span />
        </button>
        <nav className={menuOpen ? "nav open" : "nav"}>
          <a className="active" href="/templates">
            Templates
          </a>
          <a href="/#features">Features</a>
          <a href="/#how">How it works</a>
          <a href="/#pricing">Pricing</a>
        </nav>
        <div className="header-actions">
          <a className="button small" href="/#pricing">
            Get started
          </a>
        </div>
      </header>

      <section className="gallery-hero">
        <div className="gallery-flower gallery-flower-left">
          <i />
          <i />
          <i />
          <i />
        </div>
        <div className="gallery-flower gallery-flower-right">
          <i />
          <i />
          <i />
          <i />
        </div>
        <div className="gallery-shell gallery-hero-copy">
          <span className="section-kicker">Template gallery</span>
          <h1>Find the perfect invitation</h1>
          <p>Beautiful, customisable wedding websites for every celebration.</p>
        </div>
      </section>

      <section className="gallery-content gallery-shell">
        <div className="gallery-toolbar">
          <label className="gallery-search">
            <Icon name="search" size={24} />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search templates (e.g. floral, minimal, traditional...)"
            />
          </label>
          <button
            className="filter-toggle"
            onClick={() => setFiltersOpen(!filtersOpen)}
          >
            <Icon name="edit" size={18} />
            Filters {styles.length > 0 && `(${styles.length})`}
          </button>
          <label className="gallery-sort">
            <span>Sort by</span>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value)}
            >
              <option value="popular">Popular</option>
              <option value="newest">Newest</option>
              <option value="name">Name</option>
            </select>
            <Icon name="chevron" size={18} />
          </label>
        </div>

        <div className="gallery-layout">
          <aside
            className={filtersOpen ? "gallery-filters open" : "gallery-filters"}
          >
            <div className="filter-views">
              <button
                className={view === "all" ? "active" : ""}
                onClick={() => setView("all")}
              >
                <Icon name="grid" size={20} />
                <span>All Templates</span>
                <small>{galleryTemplates.length}</small>
              </button>
              <button
                className={view === "favorites" ? "active" : ""}
                onClick={() => setView("favorites")}
              >
                <Icon name="heart" size={20} />
                <span>Favorites</span>
                <small>{favorites.length}</small>
              </button>
              <button
                className={view === "recent" ? "active" : ""}
                onClick={() => setView("recent")}
              >
                <Icon name="clock" size={20} />
                <span>Recently viewed</span>
                <small>{recent.length}</small>
              </button>
            </div>

            <div className="filter-group">
              <div className="filter-title">
                <strong>Style</strong>
                <Icon name="chevron" size={17} />
              </div>
              {styleOptions.map(([style, count]) => (
                <label key={style} className="filter-check">
                  <input
                    type="checkbox"
                    checked={styles.includes(style)}
                    onChange={() => toggleStyle(style)}
                  />
                  <span>{style}</span>
                  <small>{count}</small>
                </label>
              ))}
            </div>

            {["Vibe", "Features", "Color"].map((label) => (
              <button className="filter-collapsed" key={label}>
                <span>{label}</span>
                <Icon name="chevron" size={17} />
              </button>
            ))}
          </aside>

          <div className="gallery-results">
            <div className="results-meta">
              <span>
                {visibleTemplates.length}{" "}
                {visibleTemplates.length === 1 ? "template" : "templates"}
              </span>
              {(query || styles.length > 0 || view !== "all") && (
                <button
                  onClick={() => {
                    setQuery("")
                    setStyles([])
                    setView("all")
                  }}
                >
                  Clear filters
                </button>
              )}
            </div>
            {visibleTemplates.length > 0 ? (
              <div className="gallery-grid">
                {visibleTemplates.map((template) => (
                  <article className="gallery-card" key={template.id}>
                    <button
                      className="gallery-preview"
                      aria-label={`Open ${template.title}`}
                      onClick={() => {
                        setRecent((current) =>
                          current.includes(template.id)
                            ? current
                            : [template.id, ...current],
                        )
                        window.location.assign(`/templates/${template.id}`)
                      }}
                    >
                      <img src={template.image} alt="" />
                      <span className="gallery-image-shade" />
                      <strong>{template.names.replace(" & ", "\n&\n")}</strong>
                      <span className="gallery-play">
                        <Icon name="play" size={16} />
                      </span>
                    </button>
                    <div className="gallery-card-info">
                      <div className="gallery-card-title">
                        <h2>{template.title}</h2>
                        <button
                          onClick={() => toggleFavorite(template.id)}
                          className={
                            favorites.includes(template.id) ? "favorited" : ""
                          }
                          aria-label={
                            favorites.includes(template.id)
                              ? `Remove ${template.title} from favorites`
                              : `Add ${template.title} to favorites`
                          }
                        >
                          <Icon name="heart" size={21} />
                        </button>
                      </div>
                      <div className="gallery-tags">
                        {template.tags.map((tag) => (
                          <span key={tag}>{tag}</span>
                        ))}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-gallery">
                <Icon name="search" size={28} />
                <h2>No templates found</h2>
                <p>Try a different search or clear your filters.</p>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  )
}

function HomePage() {
  const [yearly, setYearly] = useState(true)
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <main>
      <section className="hero">
        <header className="site-header shell">
          <Logo />
          <button
            className="menu-button"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle menu"
          >
            <span />
            <span />
            <span />
          </button>
          <nav className={menuOpen ? "nav open" : "nav"}>
            <a href="/templates">Templates</a>
            <a href="#features">Features</a>
            <a href="#how">How it works</a>
            <a href="#pricing">Pricing</a>
          </nav>
          <div className="header-actions">
            <a className="button small" href="#pricing">
              Get started
            </a>
          </div>
        </header>

        <div className="hero-grid shell">
          <div className="hero-copy">
            <p className="eyebrow">Wedding invitation websites</p>
            <h1>
              <span>Create a wedding</span>
              <span>website your guests</span>
              <span>
                will <em>love</em>
              </span>
            </h1>
            <p className="lead">
              Beautiful, interactive wedding invitations with
              <br className="desktop-only" /> animations, RSVPs, events,
              galleries and more.
            </p>
            <div className="hero-buttons">
              <a className="button" href="#templates">
                Start your invitation <Icon name="arrow" size={18} />
              </a>
              <a className="button outline" href="#how">
                <span className="play">
                  <Icon name="play" size={16} />
                </span>{" "}
                See it in action
              </a>
            </div>
            <div className="trust-row">
              <span>
                <Icon name="sparkle" size={18} /> Set up in minutes
              </span>
              <span>
                <Icon name="device" size={18} /> Works on all devices
              </span>
              <span>
                <Icon name="heart" size={18} /> Made for modern weddings
              </span>
            </div>
          </div>

          <div
            className="hero-art"
            aria-label="Floral wedding invitation in a green envelope"
          >
            <span className="hero-petal petal-one" />
            <span className="hero-petal petal-two" />
            <span className="hero-petal petal-three" />
            <div className="hero-botanical botanical-one">
              <i />
              <i />
              <i />
              <i />
              <i />
            </div>
            <div className="invitation-card">
              <div className="card-flower top-left" />
              <div className="card-flower top-right" />
              <span className="tiny-mark">
                A <i>&amp;</i> R
              </span>
              <p>Aisha &amp; Rohan</p>
              <span className="card-date">18 · 02 · 2025</span>
              <small>ARE GETTING MARRIED</small>
            </div>
            <div className="envelope">
              <div className="seal">
                <span />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="benefit-strip" id="features">
        <div className="shell benefit-grid">
          {[
            [
              "sparkle",
              "Premium templates",
              "Thoughtfully designed for every wedding style",
            ],
            [
              "edit",
              "Make it yours",
              "Easily customise text, colours, photos and more",
            ],
            [
              "people",
              "Manage your guests",
              "Collect RSVPs, meal choices and event attendance",
            ],
            [
              "device",
              "Share instantly",
              "Send your invitation with a simple link",
            ],
          ].map(([icon, title, text]) => (
            <article key={title}>
              <span className="benefit-icon">
                <Icon name={icon as IconName} />
              </span>
              <div>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="section shell templates" id="templates">
        <div className="section-heading row">
          <div>
            <span className="section-kicker">Curated designs</span>
            <h2>Explore beautiful templates</h2>
            <p>
              From elegant and traditional to modern and playful, find a design
              that feels like you.
            </p>
          </div>
          <a href="/templates">
            View all templates <Icon name="arrow" size={18} />
          </a>
        </div>
        <div className="template-grid">
          {templates.map((template) => (
            <button
              className="template-card"
              key={template.names}
              aria-label={`Preview ${template.names} template`}
            >
              <img src={template.image} alt="" />
              <span className="shade" />
              <strong>{template.names.replace(" & ", "\n&\n")}</strong>
              <span className="card-play">
                <Icon name="play" size={15} />
              </span>
              <small>ARE GETTING MARRIED</small>
            </button>
          ))}
        </div>
        <div className="dots">
          <i className="active" />
          <i />
          <i />
          <i />
        </div>
      </section>

      <section className="section shell how" id="how">
        <div className="section-heading centered">
          <span className="section-kicker">Simple by design</span>
          <h2>How it works</h2>
          <p>Create your wedding website in three simple steps.</p>
        </div>
        <div className="steps">
          {[
            ["calendar", "1", "Choose a template", "Pick a design you love"],
            [
              "edit",
              "2",
              "Customise",
              "Add your details, events, photos and more",
            ],
            [
              "send",
              "3",
              "Share",
              "Get a link and invite your guests instantly",
            ],
          ].map(([icon, number, title, text], index) => (
            <article key={title}>
              <span className="step-icon">
                <Icon name={icon as IconName} size={32} />
              </span>
              <strong className="number">{number}</strong>
              <div>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
              {index < 2 && <span className="step-arrow">→</span>}
            </article>
          ))}
        </div>
      </section>

      <section className="feature-panel shell">
        <div className="panel-intro">
          <span className="botanical">❧</span>
          <div>
            <h2>
              Everything you need
              <br />
              for your big day
            </h2>
            <p>
              A simple yet powerful way to share your wedding with the people
              you love.
            </p>
          </div>
        </div>
        <div className="feature-list">
          {[
            [
              "calendar",
              "Event details",
              "Share all your wedding events in one place",
            ],
            [
              "people",
              "RSVP & guest management",
              "Collect responses and keep track easily",
            ],
            [
              "gallery",
              "Photo gallery",
              "Tell your story through your favourite moments",
            ],
            [
              "link",
              "Your own link",
              "A clean, shareable link for your wedding",
            ],
            [
              "device",
              "Mobile friendly",
              "A beautiful experience on any device",
            ],
            [
              "sparkle",
              "Beautiful animations",
              "Subtle, elegant animations that feel special",
            ],
          ].map(([icon, title, text]) => (
            <article key={title}>
              <Icon name={icon as IconName} />
              <div>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="section shell pricing" id="pricing">
        <div className="section-heading row">
          <div>
            <span className="section-kicker">Plans for every celebration</span>
            <h2>Simple, transparent pricing</h2>
            <p>Choose a plan that fits your celebration.</p>
          </div>
          <div className="toggle" role="group" aria-label="Billing period">
            <button
              className={!yearly ? "active" : ""}
              onClick={() => setYearly(false)}
            >
              Monthly
            </button>
            <button
              className={yearly ? "active" : ""}
              onClick={() => setYearly(true)}
            >
              Yearly <span>Save 20%</span>
            </button>
          </div>
        </div>
        <div className="plans">
          {plans.map((plan) => (
            <article
              className={plan.featured ? "plan featured" : "plan"}
              key={plan.name}
            >
              {plan.featured && <span className="popular">Most popular</span>}
              <h3>{plan.name}</h3>
              <p>{plan.subtitle}</p>
              <div className="price">
                ₹{(yearly ? plan.yearly : plan.monthly).toLocaleString("en-IN")}
                <small> /{yearly ? "year" : "month"}</small>
              </div>
              <ul>
                {plan.features.map((feature) => (
                  <li key={feature}>
                    <Icon name="check" size={16} />
                    {feature}
                  </li>
                ))}
              </ul>
              <a
                className={plan.featured ? "button" : "button outline"}
                href="#cta"
              >
                Get started
              </a>
            </article>
          ))}
        </div>
      </section>

      <section className="testimonial shell">
        <img
          src="https://images.unsplash.com/photo-1633104502699-b2ecf0fee294?auto=format&fit=crop&w=900&q=85"
          alt="A newlywed couple in traditional wedding attire"
        />
        <div className="quote">
          <span>“</span>
          <blockquote>
            “InviteStudio made it so easy to create our wedding website.
            <br />
            Our guests loved the design and the RSVP experience!”
          </blockquote>
          <cite>— Neha &amp; Aditya</cite>
        </div>
        <div className="slider-controls">
          <i className="active" />
          <i />
          <i />
          <button aria-label="Previous testimonial">‹</button>
          <button aria-label="Next testimonial">›</button>
        </div>
      </section>

      <section className="section shell faq">
        <div className="section-heading row">
          <div>
            <span className="section-kicker">Questions, answered</span>
            <h2>Frequently asked questions</h2>
            <p>Have a question? We’re here to help.</p>
          </div>
          <a href="#faq-list">
            View all FAQs <Icon name="arrow" size={18} />
          </a>
        </div>
        <div className="faq-grid" id="faq-list">
          {faqs.map(([question, answer], index) => (
            <div
              className={openFaq === index ? "faq-item open" : "faq-item"}
              key={question}
            >
              <button
                onClick={() => setOpenFaq(openFaq === index ? null : index)}
                aria-expanded={openFaq === index}
              >
                {question}
                <span>{openFaq === index ? "−" : "+"}</span>
              </button>
              <p>{answer}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="cta shell" id="cta">
        <div className="cta-leaves left" />
        <div className="cta-leaves right" />
        <div>
          <h2>Ready to create your wedding website?</h2>
          <p>
            Pick a template, make it yours, and share it with your loved ones in
            minutes.
          </p>
        </div>
        <a className="button light" href="/templates">
          Get started for free <Icon name="arrow" size={18} />
        </a>
      </section>

      <footer className="footer shell" id="footer">
        <Logo />
        <nav>
          <a href="/templates">Templates</a>
          <a href="#features">Features</a>
          <a href="#how">How it works</a>
          <a href="#pricing">Pricing</a>
          <a href="#faq-list">FAQs</a>
        </nav>
        <div className="socials">
          <a href="#instagram" aria-label="Instagram">
            ◎
          </a>
          <a href="#youtube" aria-label="YouTube">
            ▶
          </a>
          <a href="#pinterest" aria-label="Pinterest">
            p
          </a>
        </div>
      </footer>
    </main>
  )
}

export default function App() {
  const normalizedPath = window.location.pathname.replace(/\/+$/, "")
  const editorMatch = normalizedPath.match(/\/editor\/(\d+)/)
  if (editorMatch) {
    return <EditorPage templateId={Number(editorMatch[1])} />
  }
  const detailMatch = normalizedPath.match(/\/templates\/(\d+)/)
  if (detailMatch) {
    return <TemplateDetailPage templateId={Number(detailMatch[1])} />
  }
  return normalizedPath.includes("/templates") ? (
    <TemplatesPage />
  ) : (
    <HomePage />
  )
}

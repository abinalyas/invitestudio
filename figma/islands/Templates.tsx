// Templates browse screen from the Figma Make export (App.tsx lines 789-1053).
import { useState } from "react";
import { Icon, IconName, Logo, galleryTemplates, styleOptions } from "./shared";
import { bridge } from "./bridge";
export function TemplatesPage() {
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState("featured")
  const [styles, setStyles] = useState<string[]>([])
  const [favorites, setFavorites] = useState<number[]>([])
  const [recent, setRecent] = useState<number[]>([])
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
      return 0
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
          <p>Wedding invitations you can make your own.</p>
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
              <option value="featured">Featured</option>
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


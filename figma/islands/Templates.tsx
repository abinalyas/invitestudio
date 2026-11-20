// Templates browse screen from the Figma Make export (App.tsx lines 789-1053).
import { useState } from "react";
import { Icon, IconName, Logo, galleryTemplates, styleOptions } from "./shared";
import { bridge } from "./bridge";
import { formatMoney, tierOf, usePricing } from "./pricing";
import { MyProjectsLink, TalkToUs } from "./extras";
export function TemplatesPage() {
  const { data: pricing } = usePricing()
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState("featured")
  const [styles, setStyles] = useState<string[]>([])
  // The price tier to show (classic, premium or signature). The pricing cards on the home page link here with ?tier=<id>.
  const [tier, setTier] = useState<string>(() => {
    try { return new URLSearchParams(window.location.search).get("tier") || "" } catch { return "" }
  })
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

  // Only a tier the prices know is applied, so a mistyped address or prices that did not load simply show every design.
  const activeTier = pricing && pricing.tiers.some((item) => item.id === tier) ? tier : ""
  const activeTierName = activeTier && pricing ? pricing.tiers.find((item) => item.id === activeTier)?.name ?? "" : ""
  const tierOfTemplate = (backendId: string) => (pricing ? pricing.templates[backendId] || "classic" : "")
  const chooseTier = (next: string) => {
    setTier(next)
    // Keep the address in step, so a refresh or a shared link shows the same designs.
    try {
      const url = new URL(window.location.href)
      if (next) url.searchParams.set("tier", next)
      else url.searchParams.delete("tier")
      window.history.replaceState(window.history.state, "", url)
    } catch { /* the filter still works; the address just is not updated */ }
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
      const matchesTier = !activeTier || tierOfTemplate(template.backendId) === activeTier
      return matchesSearch && matchesStyle && matchesView && matchesTier
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
          <a href="/#how">How it works</a>
          <a href="/#pricing">Pricing</a>
        </nav>
        <div className="header-actions"><MyProjectsLink /></div>
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
          <p>Try any design free. You pay only when you publish.</p>
          <p className="gallery-talk"><TalkToUs topic="custom" lead="Want a design made just for you? Talk to us:" /></p>
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
              placeholder="Search by style or colour"
            />
          </label>
          <button
            className="filter-toggle"
            onClick={() => setFiltersOpen(!filtersOpen)}
          >
            <Icon name="edit" size={18} />
            Filters {styles.length + (activeTier ? 1 : 0) > 0 && `(${styles.length + (activeTier ? 1 : 0)})`}
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

            {pricing ? (
              <div className="filter-group" data-tier-filter>
                <div className="filter-title">
                  <strong>Price</strong>
                  <Icon name="chevron" size={17} />
                </div>
                {pricing.tiers.map((item) => (
                  <label key={item.id} className="filter-check">
                    <input
                      type="checkbox"
                      checked={activeTier === item.id}
                      onChange={() => chooseTier(activeTier === item.id ? "" : item.id)}
                    />
                    <span>{item.name}</span>
                    <small>{galleryTemplates.filter((template) => tierOfTemplate(template.backendId) === item.id).length}</small>
                  </label>
                ))}
              </div>
            ) : null}

          </aside>

          <div className="gallery-results">
            <div className="results-meta">
              <span>
                {visibleTemplates.length}{" "}
                {visibleTemplates.length === 1 ? "template" : "templates"}
              </span>
              {(query || styles.length > 0 || view !== "all" || activeTier) && (
                <button
                  onClick={() => {
                    setQuery("")
                    setStyles([])
                    setView("all")
                    chooseTier("")
                  }}
                >
                  Clear filters
                </button>
              )}
            </div>
            {activeTier ? (
              <div className="tier-note" role="status" data-tier-note>
                <span>
                  Showing {visibleTemplates.length} <strong>{activeTierName}</strong>{" "}
                  {visibleTemplates.length === 1 ? "design" : "designs"}
                </span>
                <button type="button" onClick={() => chooseTier("")}>Show all designs</button>
              </div>
            ) : null}
            {visibleTemplates.length > 0 ? (
              <div className="gallery-grid">
                {visibleTemplates.map((template) => (
                  <article className={template.fullArt ? "gallery-card is-full-art" : "gallery-card"} key={template.id}>
                    <button
                      className={template.fullArt ? "gallery-preview is-full-art" : "gallery-preview"}
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
                      {template.fullArt ? null : (
                        <>
                          <span className="gallery-image-shade" />
                          <strong>{template.names.replace(" & ", "\n&\n")}</strong>
                        </>
                      )}
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
                      {pricing && (() => {
                        const tier = tierOf(pricing, template.backendId)
                        return tier ? (
                          <p className="gallery-price">
                            {tier.name} <strong>{formatMoney(tier.amountMinor, pricing.currency, pricing.locale)}</strong> to publish
                          </p>
                        ) : null
                      })()}
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


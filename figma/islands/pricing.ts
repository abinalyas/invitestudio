// Prices for the pages. They come from /api/pricing, which looks at the visitor's country on the server; nothing here decides a price.
// The country is worked out on the server, so the visitor never chooses it.
import { useEffect, useState } from "react"

export type PricingTier = { id: string; name: string; tagline: string; features: string[]; amountMinor: number }
export type PricingData = {
  region: string
  currency: string
  locale: string
  tiers: PricingTier[]
  templates: Record<string, string>
  country: string
  mode: "early-access" | "live"
}

let cache: Promise<PricingData | null> | null = null

export function loadPricing(): Promise<PricingData | null> {
  if (!cache) {
    cache = fetch("/api/pricing", { headers: { Accept: "application/json" } })
      .then((response) => (response.ok ? (response.json() as Promise<PricingData>) : null))
      .catch(() => null)
  }
  return cache
}

// The amount written the way people there write it (₹2,999, $59, £45). A price that cannot be written is not shown.
export function formatMoney(amountMinor: number, currency: string, locale: string): string {
  try {
    const whole = amountMinor % 100 === 0
    return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 }).format(amountMinor / 100)
  } catch {
    return ""
  }
}

// `data` is null until the prices arrive, and stays null if they cannot be loaded (the pages then show no numbers rather than wrong ones).
export function usePricing() {
  const [data, setData] = useState<PricingData | null>(null)
  useEffect(() => {
    let live = true
    loadPricing().then((result) => {
      if (live) setData(result)
    })
    return () => {
      live = false
    }
  }, [])
  return { data }
}

export function tierOf(data: PricingData | null, backendId: string): PricingTier | null {
  if (!data) return null
  return data.tiers.find((tier) => tier.id === (data.templates[backendId] || "classic")) || null
}

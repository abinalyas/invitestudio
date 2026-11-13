// Prices for the pages. They come from /api/pricing, which looks at the visitor's country on the server; nothing here decides a price.
// The visitor can pick another region (people travel and use VPNs); the choice is remembered on this device.
import { useEffect, useState } from "react"

export type PricingTier = { id: string; name: string; tagline: string; features: string[]; amountMinor: number }
export type PricingData = {
  region: string
  currency: string
  locale: string
  tiers: PricingTier[]
  templates: Record<string, string>
  regions: Array<{ id: string; name: string; currency: string }>
  country: string
  detected: boolean
  mode: "early-access" | "live"
}

const KEY = "invitestudio-region"
const cache = new Map<string, Promise<PricingData | null>>()

function savedRegion(): string {
  try {
    return window.localStorage.getItem(KEY) || ""
  } catch {
    return ""
  }
}

export function chooseRegion(region: string) {
  try {
    if (region) window.localStorage.setItem(KEY, region)
    else window.localStorage.removeItem(KEY)
  } catch {
    /* the choice is only a convenience */
  }
}

export function loadPricing(region: string): Promise<PricingData | null> {
  const key = region || "auto"
  let pending = cache.get(key)
  if (!pending) {
    pending = fetch(region ? `/api/pricing?region=${encodeURIComponent(region)}` : "/api/pricing", { headers: { Accept: "application/json" } })
      .then((response) => (response.ok ? (response.json() as Promise<PricingData>) : null))
      .catch(() => null)
    cache.set(key, pending)
  }
  return pending
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
  const [region, setRegionState] = useState<string>(() => savedRegion())
  const [data, setData] = useState<PricingData | null>(null)
  useEffect(() => {
    let live = true
    loadPricing(region).then((result) => {
      if (live) setData(result)
    })
    return () => {
      live = false
    }
  }, [region])
  return {
    data,
    setRegion: (next: string) => {
      chooseRegion(next)
      setRegionState(next)
    },
  }
}

export function tierOf(data: PricingData | null, backendId: string): PricingTier | null {
  if (!data) return null
  return data.tiers.find((tier) => tier.id === (data.templates[backendId] || "classic")) || null
}

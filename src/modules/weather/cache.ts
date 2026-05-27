type CacheEntry<T> = {
  value: T
  expiresAt: number
}

export class TimedCache<T> {
  private store = new Map<string, CacheEntry<T>>()

  constructor(private readonly maxEntries: number, private readonly ttlMs: number) {}

  get(key: string): T | null {
    const entry = this.store.get(key)
    if (!entry) return null

    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key)
      return null
    }

    // Promote key for LRU-like behavior.
    this.store.delete(key)
    this.store.set(key, entry)
    return entry.value
  }

  set(key: string, value: T): void {
    if (this.store.has(key)) {
      this.store.delete(key)
    }

    this.store.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs,
    })

    while (this.store.size > this.maxEntries) {
      const oldestKey = this.store.keys().next().value as string | undefined
      if (!oldestKey) break
      this.store.delete(oldestKey)
    }
  }

  has(key: string): boolean {
    return this.get(key) !== null
  }
}

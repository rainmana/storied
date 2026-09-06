/** Install before loading model assets. Story text never becomes a URL, header, or request body. */
export function installAssetGate() {
  const originalFetch = self.fetch.bind(self)
  let downloadsAllowed = false
  self.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init)
    const url = new URL(request.url)
    if (request.method !== 'GET' && request.method !== 'HEAD')
      throw new Error('Model workers only download assets. Network writes are disabled.')
    if (request.body) throw new Error('Model requests cannot contain a body.')
    const local = url.origin === self.location.origin
    const approved =
      url.protocol === 'https:' &&
      (url.hostname === 'huggingface.co' ||
        url.hostname.endsWith('.huggingface.co') ||
        url.hostname.endsWith('.hf.co') ||
        url.hostname === 'raw.githubusercontent.com')
    if (!local && (!downloadsAllowed || !approved))
      throw new Error(
        'A model asset is not cached. Use the explicit Download action in Local models while online.',
      )
    return originalFetch(
      new Request(request, { credentials: 'omit', referrerPolicy: 'no-referrer' }),
    )
  }
  return {
    allowDownloads: (allow: boolean) => {
      downloadsAllowed = allow
    },
  }
}

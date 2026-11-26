// Retry temporary transport/server failures once within the caller's deadline.
// Quota, authentication and invalid-request errors must go to the next provider.
export async function fetchWithRetry(url, options, { fetcher, retryTransient = false }) {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetcher(url, options);
      if (!retryTransient || attempt > 0 || ![408, 500, 502, 503, 504].includes(response.status)) return response;
      await response.body?.cancel();
    } catch (error) {
      const networkFailure = error instanceof TypeError ||
        ['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT'].includes(error?.cause?.code);
      if (!retryTransient || attempt > 0 || options.signal.aborted || !networkFailure) throw error;
    }
    await new Promise(resolve => setTimeout(resolve, 250));
    options.signal.throwIfAborted();
  }
}

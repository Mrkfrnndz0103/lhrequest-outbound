export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  onTimeout: () => T
) {
  let timeout: NodeJS.Timeout

  return Promise.race([
    promise.finally(() => clearTimeout(timeout)),
    new Promise<T>((resolve) => {
      timeout = setTimeout(() => resolve(onTimeout()), timeoutMs)
    }),
  ])
}

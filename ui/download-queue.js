export function createDownloadRequestFingerprint(request) {
  return JSON.stringify({
    host: request.host,
    port: request.port,
    localPort: request.localPort,
    level: request.level,
    outputDir: request.outputDir,
    queryModel: request.queryModel ?? null,
    callingAet: request.callingAet ?? '',
    calledAet: request.calledAet ?? '',
    timeoutSec: request.timeoutSec ?? null,
    keys: [...(request.keys ?? [])].map((value) => String(value)).sort(),
  });
}

export function isPendingDownloadState(state) {
  return state === 'queued' || state === 'preparing' || state === 'downloading'
}

export function toPlainDownloadRequest(request) {
  return JSON.parse(JSON.stringify(request))
}

export class PacsDownloadQueue {
  constructor() {
    this.activeItem = null
    this.waitingItems = []
  }

  getActive() {
    return this.activeItem
  }

  getWaitingItems() {
    return [...this.waitingItems]
  }

  get waitingCount() {
    return this.waitingItems.length
  }

  hasPendingItem(rowKey, requestFingerprint) {
    return this.matches(this.activeItem, rowKey, requestFingerprint)
      || this.waitingItems.some((item) => this.matches(item, rowKey, requestFingerprint))
  }

  enqueue(item) {
    if (this.hasPendingItem(item.rowKey, item.requestFingerprint)) {
      return {
        accepted: false,
        queuePosition: this.getQueuePosition(item.rowKey),
      }
    }

    this.waitingItems.push({ ...item })
    return {
      accepted: true,
      queuePosition: this.waitingItems.length,
    }
  }

  startNext() {
    if (this.activeItem || this.waitingItems.length === 0) {
      return null
    }

    this.activeItem = this.waitingItems.shift()
    return this.activeItem
  }

  advance() {
    const finished = this.activeItem
    this.activeItem = null

    return {
      finished,
      next: this.waitingItems[0] ?? null,
    }
  }

  getQueuePosition(rowKey) {
    const index = this.waitingItems.findIndex((item) => item.rowKey === rowKey)
    return index === -1 ? null : index + 1
  }

  matches(item, rowKey, requestFingerprint) {
    return Boolean(item) && (item.rowKey === rowKey || item.requestFingerprint === requestFingerprint)
  }
}
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PacsDownloadQueue,
  createDownloadRequestFingerprint,
  toPlainDownloadRequest,
} from './download-queue.js'

function createRequest(id) {
  return {
    host: '127.0.0.1',
    port: 4242,
    localPort: 10104,
    level: 'STUDY',
    outputDir: 'C:/downloads',
    calledAet: 'ORTHANC',
    callingAet: 'PMTARO',
    timeoutSec: 5,
    keys: [`StudyInstanceUID=${id}`],
  }
}

function createQueueItem(rowKey, id) {
  const request = createRequest(id)
  return {
    rowKey,
    request,
    requestFingerprint: createDownloadRequestFingerprint(request),
  }
}

test('queue preserves FIFO order', () => {
  const queue = new PacsDownloadQueue()
  queue.enqueue(createQueueItem('row-1', 'study-1'))
  queue.enqueue(createQueueItem('row-2', 'study-2'))

  const first = queue.startNext()

  assert.equal(first?.rowKey, 'row-1')
  assert.equal(queue.waitingCount, 1)

  const { next } = queue.advance()
  assert.equal(queue.getActive(), null)
  assert.equal(queue.waitingCount, 1)
  assert.equal(next?.rowKey, 'row-2')

  const second = queue.startNext()
  assert.equal(second?.rowKey, 'row-2')
  assert.equal(queue.waitingCount, 0)
})

test('queue suppresses duplicate rows and duplicate requests', () => {
  const queue = new PacsDownloadQueue()
  const first = createQueueItem('row-1', 'study-1')

  assert.equal(queue.enqueue(first).accepted, true)
  assert.equal(queue.enqueue(createQueueItem('row-1', 'study-2')).accepted, false)
  assert.equal(queue.enqueue(createQueueItem('row-2', 'study-1')).accepted, false)
})

test('request fingerprint ignores key ordering', () => {
  const first = createDownloadRequestFingerprint({
    ...createRequest('study-1'),
    keys: ['PatientID=123', 'StudyInstanceUID=study-1'],
  })
  const second = createDownloadRequestFingerprint({
    ...createRequest('study-1'),
    keys: ['StudyInstanceUID=study-1', 'PatientID=123'],
  })

  assert.equal(first, second)
})

test('plain download request is cloneable after reactive proxy wrapping', () => {
  const request = createRequest('study-1')
  const proxiedRequest = new Proxy(request, {})

  assert.throws(() => structuredClone(proxiedRequest))

  const plainRequest = toPlainDownloadRequest(proxiedRequest)

  assert.deepEqual(plainRequest, request)
  assert.doesNotThrow(() => structuredClone(plainRequest))
})
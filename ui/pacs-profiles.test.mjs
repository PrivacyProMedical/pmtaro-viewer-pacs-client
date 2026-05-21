import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PACS_PROFILE_STORAGE_KEY,
  PACS_PROFILE_SELECTED_ID_STORAGE_KEY,
  createDefaultProfile,
  createDefaultProfileState,
  hasPendingProfileOperations,
  loadProfileState,
  removeProfileState,
  saveProfileState,
  selectProfileState,
  toRuntimeProfile,
  upsertProfileState,
  validateProfileDraft,
} from './pacs-profiles.js'

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial))

  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null
    },
    setItem(key, value) {
      values.set(key, String(value))
    },
  }
}

test('loadProfileState returns a default profile when storage is empty', () => {
  const storage = createStorage()

  const state = loadProfileState(storage)

  assert.equal(state.selectedProfileId, 'default')
  assert.equal(state.profiles.length, 1)
  assert.equal(state.profiles[0].name, 'Default PACS')
})

test('saveProfileState persists and restores the selected profile', () => {
  const storage = createStorage()
  const secondProfile = createDefaultProfile({
    id: 'orthanc-2',
    name: 'Orthanc QA',
    host: '10.0.0.8',
    storageFolder: '/tmp/dicom',
  })
  const state = upsertProfileState(createDefaultProfileState(), secondProfile, { select: true })

  saveProfileState(storage, state)
  const restored = loadProfileState(storage)

  assert.equal(restored.selectedProfileId, 'orthanc-2')
  assert.equal(restored.profiles.length, 1)
  assert.equal(restored.profiles[0].host, '10.0.0.8')
  assert.ok(storage.getItem(PACS_PROFILE_STORAGE_KEY))
  assert.equal(storage.getItem(PACS_PROFILE_SELECTED_ID_STORAGE_KEY), 'orthanc-2')
})

test('upsertProfileState replaces the empty default placeholder when the first saved profile is added', () => {
  const state = upsertProfileState(
    createDefaultProfileState(),
    createDefaultProfile({ id: 'profile-1', name: 'Saved PACS', host: '10.0.0.8' }),
    { select: true },
  )

  assert.equal(state.selectedProfileId, 'profile-1')
  assert.deepEqual(state.profiles.map((profile) => profile.name), ['Saved PACS'])
})

test('loadProfileState falls back to the first saved profile when selected profile id is invalid', () => {
  const storage = createStorage({
    [PACS_PROFILE_STORAGE_KEY]: JSON.stringify({
      version: 1,
      selectedProfileId: 'missing-profile',
      profiles: [
        createDefaultProfile({ id: 'profile-1', name: 'Broken State' }),
      ],
    }),
  })

  const state = loadProfileState(storage)

  assert.equal(state.selectedProfileId, 'profile-1')
  assert.equal(state.profiles.length, 1)
  assert.equal(state.profiles[0].name, 'Broken State')
})

test('loadProfileState prefers the dedicated selected profile storage key', () => {
  const storage = createStorage({
    [PACS_PROFILE_STORAGE_KEY]: JSON.stringify({
      version: 1,
      selectedProfileId: 'default',
      profiles: [
        createDefaultProfile(),
        createDefaultProfile({ id: 'profile-2', name: 'Profile 2', host: '10.0.0.9' }),
      ],
    }),
    [PACS_PROFILE_SELECTED_ID_STORAGE_KEY]: 'profile-2',
  })

  const state = loadProfileState(storage)

  assert.equal(state.selectedProfileId, 'profile-2')
  assert.equal(state.profiles.length, 1)
  assert.equal(state.profiles[0].name, 'Profile 2')
})

test('validateProfileDraft rejects duplicate names and invalid ports', () => {
  const profiles = [
    createDefaultProfile({ id: 'profile-1', name: 'Orthanc QA' }),
  ]

  const result = validateProfileDraft({
    name: 'Orthanc QA',
    host: '127.0.0.1',
    port: '70000',
    calledAet: 'ORTHANC',
    myAet: 'PMTARO',
    localPort: 0,
    timeoutSec: 3,
    storageFolder: '',
  }, profiles)

  assert.equal(result.isValid, false)
  assert.equal(result.errors.name, 'Profile name must be unique.')
  assert.equal(result.errors.port, 'Port must be an integer between 1 and 65535.')
  assert.equal(result.errors.localPort, 'Local port must be an integer between 1 and 65535.')
  assert.equal(result.errors.storageFolder, 'Storage folder is required.')
})

test('selectProfileState switches the current profile and runtime mapping matches', () => {
  const nextProfile = createDefaultProfile({
    id: 'profile-2',
    name: 'Remote PACS',
    host: '10.10.10.2',
    calledAet: 'REMOTE',
    myAet: 'VIEWER',
    localPort: 11112,
    timeoutSec: 7,
    storageFolder: '/data/pacs',
  })
  const state = upsertProfileState(createDefaultProfileState(), nextProfile)

  const selectedState = selectProfileState(state, 'profile-2')
  const runtimeProfile = toRuntimeProfile(nextProfile)

  assert.equal(selectedState.selectedProfileId, 'profile-2')
  assert.deepEqual(runtimeProfile, {
    myAet: 'VIEWER',
    timeoutSec: 7,
    storageFolder: '/data/pacs',
    pacs: {
      aet: 'REMOTE',
      host: '10.10.10.2',
      port: 4242,
      localPort: 11112,
    },
  })
})

test('removeProfileState resets to default state when the last profile is removed', () => {
  const firstSavedProfileState = upsertProfileState(
    createDefaultProfileState(),
    createDefaultProfile({ id: 'profile-1', name: 'Profile 1' }),
    { select: true },
  )

  const { removed, state } = removeProfileState(firstSavedProfileState, 'profile-1')

  assert.equal(removed, true)
  assert.equal(state.selectedProfileId, 'default')
  assert.equal(state.profiles.length, 1)
  assert.equal(state.profiles[0].name, 'Default PACS')
})

test('removeProfileState switches selection when the selected profile is removed from a multi-profile list', () => {
  const firstSavedProfileState = upsertProfileState(
    createDefaultProfileState(),
    createDefaultProfile({ id: 'profile-1', name: 'Profile 1' }),
    { select: true },
  )
  const multiProfileState = upsertProfileState(
    firstSavedProfileState,
    createDefaultProfile({ id: 'profile-2', name: 'Profile 2' }),
    { select: true },
  )
  const { removed, state } = removeProfileState(multiProfileState, 'profile-2')

  assert.equal(removed, true)
  assert.equal(state.selectedProfileId, 'profile-1')
  assert.equal(state.profiles.length, 1)
})

test('hasPendingProfileOperations detects queued and active downloads', () => {
  assert.equal(hasPendingProfileOperations({ waitingCount: 0, getActive: () => null }), false)
  assert.equal(hasPendingProfileOperations({ waitingCount: 2, getActive: () => null }), true)
  assert.equal(hasPendingProfileOperations({ waitingCount: 0, getActive: () => ({ jobId: 'job-1' }) }), true)
})
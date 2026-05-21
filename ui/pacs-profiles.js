export const PACS_PROFILE_STORAGE_KEY = 'pmtaro.pacs-client.profiles'
export const PACS_PROFILE_SELECTED_ID_STORAGE_KEY = 'pmtaro.pacs-client.selected-profile'
export const PACS_PROFILE_STORAGE_VERSION = 1

const DEFAULT_PROFILE = Object.freeze({
  id: 'default',
  name: 'Default PACS',
  host: '127.0.0.1',
  port: 4242,
  calledAet: 'ORTHANC',
  myAet: 'PMTARO',
  localPort: 10104,
  timeoutSec: 3,
  storageFolder: '',
})

function asTrimmedString(value) {
  if (value == null) {
    return ''
  }
  return String(value).trim()
}

function toValidPort(value, fallback = DEFAULT_PROFILE.port) {
  const parsed = typeof value === 'number' ? value : Number(asTrimmedString(value))
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 65535 ? parsed : fallback
}

function toTimeoutSec(value, fallback = DEFAULT_PROFILE.timeoutSec) {
  const parsed = typeof value === 'number' ? value : Number(asTrimmedString(value))
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

function buildStoredProfile(rawProfile, index, usedIds = new Set()) {
  let id = asTrimmedString(rawProfile?.id) || createProfileId()
  while (usedIds.has(id)) {
    id = createProfileId()
  }
  usedIds.add(id)

  return {
    id,
    name: asTrimmedString(rawProfile?.name) || `PACS ${index + 1}`,
    host: asTrimmedString(rawProfile?.host),
    port: toValidPort(rawProfile?.port),
    calledAet: asTrimmedString(rawProfile?.calledAet),
    myAet: asTrimmedString(rawProfile?.myAet),
    localPort: toValidPort(rawProfile?.localPort, DEFAULT_PROFILE.localPort),
    timeoutSec: toTimeoutSec(rawProfile?.timeoutSec),
    storageFolder: asTrimmedString(rawProfile?.storageFolder),
  }
}

function isDefaultPlaceholderProfile(profile) {
  if (!profile || typeof profile !== 'object') {
    return false
  }

  return asTrimmedString(profile.id) === DEFAULT_PROFILE.id
    && asTrimmedString(profile.name) === DEFAULT_PROFILE.name
    && asTrimmedString(profile.host) === DEFAULT_PROFILE.host
    && toValidPort(profile.port) === DEFAULT_PROFILE.port
    && asTrimmedString(profile.calledAet) === DEFAULT_PROFILE.calledAet
    && asTrimmedString(profile.myAet) === DEFAULT_PROFILE.myAet
    && toValidPort(profile.localPort, DEFAULT_PROFILE.localPort) === DEFAULT_PROFILE.localPort
    && toTimeoutSec(profile.timeoutSec) === DEFAULT_PROFILE.timeoutSec
    && asTrimmedString(profile.storageFolder) === DEFAULT_PROFILE.storageFolder
}

function prunePlaceholderDefaultProfiles(profiles) {
  if (!Array.isArray(profiles) || profiles.length <= 1) {
    return profiles
  }

  const persistedProfiles = profiles.filter((profile) => !isDefaultPlaceholderProfile(profile))
  return persistedProfiles.length > 0 ? persistedProfiles : profiles
}

export function createProfileId() {
  return `profile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function createDefaultProfile(overrides = {}) {
  return {
    ...DEFAULT_PROFILE,
    ...overrides,
  }
}

export function createDefaultProfileState() {
  const profile = createDefaultProfile()
  return {
    version: PACS_PROFILE_STORAGE_VERSION,
    selectedProfileId: profile.id,
    profiles: [profile],
  }
}

function resolveSelectedProfileId(profiles, preferredSelectedProfileId, fallbackSelectedProfileId) {
  const candidates = [preferredSelectedProfileId, fallbackSelectedProfileId]
    .map((value) => asTrimmedString(value))
    .filter(Boolean)

  for (const candidate of candidates) {
    if (profiles.some((profile) => profile.id === candidate)) {
      return candidate
    }
  }

  return profiles[0]?.id ?? createDefaultProfile().id
}

export function normalizeProfileState(rawState, preferredSelectedProfileId = '') {
  if (
    !rawState
    || typeof rawState !== 'object'
    || !Array.isArray(rawState.profiles)
    || rawState.profiles.length === 0
  ) {
    return createDefaultProfileState()
  }

  const usedIds = new Set()
  const profiles = prunePlaceholderDefaultProfiles(
    rawState.profiles.map((profile, index) => buildStoredProfile(profile, index, usedIds)),
  )
  const selectedProfileId = resolveSelectedProfileId(
    profiles,
    preferredSelectedProfileId,
    rawState.selectedProfileId,
  )

  return {
    version: PACS_PROFILE_STORAGE_VERSION,
    selectedProfileId,
    profiles,
  }
}

export function parseProfileState(rawValue, preferredSelectedProfileId = '') {
  try {
    return normalizeProfileState(JSON.parse(rawValue), preferredSelectedProfileId)
  } catch {
    return createDefaultProfileState()
  }
}

export function loadProfileState(storage = globalThis.localStorage) {
  try {
    const rawValue = storage?.getItem?.(PACS_PROFILE_STORAGE_KEY)
    if (!rawValue) {
      return createDefaultProfileState()
    }
    const preferredSelectedProfileId = storage?.getItem?.(PACS_PROFILE_SELECTED_ID_STORAGE_KEY) ?? ''
    return parseProfileState(rawValue, preferredSelectedProfileId)
  } catch {
    return createDefaultProfileState()
  }
}

export function saveProfileState(storage = globalThis.localStorage, state) {
  const normalized = normalizeProfileState(state)

  try {
    storage?.setItem?.(PACS_PROFILE_STORAGE_KEY, JSON.stringify(normalized))
    storage?.setItem?.(PACS_PROFILE_SELECTED_ID_STORAGE_KEY, normalized.selectedProfileId)
  } catch {
    // Ignore storage failures and keep runtime state usable.
  }

  return normalized
}

export function validateProfileDraft(draft, profiles = [], editingId = null) {
  const id = asTrimmedString(draft?.id) || editingId || createProfileId()
  const profile = {
    id,
    name: asTrimmedString(draft?.name),
    host: asTrimmedString(draft?.host),
    port: typeof draft?.port === 'number' ? draft.port : Number(asTrimmedString(draft?.port)),
    calledAet: asTrimmedString(draft?.calledAet),
    myAet: asTrimmedString(draft?.myAet),
    localPort: typeof draft?.localPort === 'number' ? draft.localPort : Number(asTrimmedString(draft?.localPort)),
    timeoutSec: toTimeoutSec(draft?.timeoutSec),
    storageFolder: asTrimmedString(draft?.storageFolder),
  }

  const errors = {}
  const normalizedName = profile.name.toLowerCase()

  if (!profile.name) {
    errors.name = 'Profile name is required.'
  } else if (
    profiles.some(
      (currentProfile) => currentProfile.id !== editingId
        && asTrimmedString(currentProfile.name).toLowerCase() === normalizedName,
    )
  ) {
    errors.name = 'Profile name must be unique.'
  }

  if (!Number.isInteger(profile.port) || profile.port < 1 || profile.port > 65535) {
    errors.port = 'Port must be an integer between 1 and 65535.'
  }

  if (!Number.isInteger(profile.localPort) || profile.localPort < 1 || profile.localPort > 65535) {
    errors.localPort = 'Local port must be an integer between 1 and 65535.'
  }

  if (!profile.host) {
    errors.host = 'Host is required.'
  }

  if (!profile.calledAet) {
    errors.calledAet = 'Called AE Title is required.'
  }

  if (!profile.myAet) {
    errors.myAet = 'My AE Title is required.'
  }

  if (!profile.storageFolder) {
    errors.storageFolder = 'Storage folder is required.'
  }

  return {
    errors,
    isValid: Object.keys(errors).length === 0,
    profile,
  }
}

export function upsertProfileState(state, profile, options = {}) {
  const normalized = normalizeProfileState(state)
  const candidate = {
    ...profile,
    id: asTrimmedString(profile?.id) || createProfileId(),
  }
  const nextProfiles = [...normalized.profiles]
  const profileIndex = nextProfiles.findIndex((currentProfile) => currentProfile.id === candidate.id)

  if (profileIndex === -1) {
    nextProfiles.push(candidate)
  } else {
    nextProfiles.splice(profileIndex, 1, candidate)
  }

  return normalizeProfileState({
    version: PACS_PROFILE_STORAGE_VERSION,
    selectedProfileId: options.select ? candidate.id : normalized.selectedProfileId,
    profiles: nextProfiles,
  })
}

export function selectProfileState(state, profileId) {
  const normalized = normalizeProfileState(state)
  if (!normalized.profiles.some((profile) => profile.id === profileId)) {
    return normalized
  }

  return {
    ...normalized,
    selectedProfileId: profileId,
  }
}

export function removeProfileState(state, profileId) {
  const normalized = normalizeProfileState(state)
  if (!normalized.profiles.some((profile) => profile.id === profileId)) {
    return {
      removed: false,
      state: normalized,
    }
  }

  const profiles = normalized.profiles.filter((profile) => profile.id !== profileId)

  if (profiles.length === 0) {
    return {
      removed: true,
      state: createDefaultProfileState(),
    }
  }

  const selectedProfileId = normalized.selectedProfileId === profileId
    ? profiles[0].id
    : normalized.selectedProfileId

  return {
    removed: true,
    state: {
      version: PACS_PROFILE_STORAGE_VERSION,
      selectedProfileId,
      profiles,
    },
  }
}

export function hasPendingProfileOperations(queueLike) {
  const waitingCount = Number(queueLike?.waitingCount ?? 0)
  const activeItem = typeof queueLike?.getActive === 'function'
    ? queueLike.getActive()
    : (queueLike?.activeItem ?? null)

  return waitingCount > 0 || Boolean(activeItem)
}

export function toRuntimeProfile(profile) {
  return {
    myAet: profile.myAet,
    timeoutSec: profile.timeoutSec,
    storageFolder: profile.storageFolder,
    pacs: {
      aet: profile.calledAet,
      host: profile.host,
      port: profile.port,
      localPort: profile.localPort,
    },
  }
}
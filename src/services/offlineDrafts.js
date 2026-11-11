const DATABASE_NAME = 'acadex-offline-drafts'
const STORE_NAME = 'assignment-submissions'
const DATABASE_VERSION = 1

function openDraftDatabase() {
  if (!('indexedDB' in window)) return Promise.reject(new Error('Offline draft storage is not available in this browser.'))
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.addEventListener('upgradeneeded', () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: 'assignmentId' })
      }
    })
    request.addEventListener('success', () => resolve(request.result))
    request.addEventListener('error', () => reject(new Error('Could not open offline draft storage.')))
  })
}

async function withDraftStore(mode, operation) {
  const database = await openDraftDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode)
    const request = operation(transaction.objectStore(STORE_NAME))
    request.addEventListener('success', () => resolve(request.result))
    request.addEventListener('error', () => reject(new Error('Could not update your offline assignment draft.')))
    transaction.addEventListener('abort', () => reject(new Error('Offline assignment draft storage was interrupted.')))
    transaction.addEventListener('complete', () => database.close())
  })
}

export function saveAssignmentDraft(assignmentId, comment, files) {
  return withDraftStore('readwrite', (store) => store.put({
    assignmentId: String(assignmentId),
    comment,
    files: [...files],
    updatedAt: Date.now(),
  }))
}

export function getAssignmentDraft(assignmentId) {
  return withDraftStore('readonly', (store) => store.get(String(assignmentId)))
}

export function clearAssignmentDraft(assignmentId) {
  return withDraftStore('readwrite', (store) => store.delete(String(assignmentId)))
}

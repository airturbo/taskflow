export const SCHEMA_VERSION_CONST = 1

export const getDeviceId = (): string => {
  const key = 'taskflow-device-id'
  let id = localStorage.getItem(key)
  if (!id) {
    id = `dev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    localStorage.setItem(key, id)
  }
  return id
}

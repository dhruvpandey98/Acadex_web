export function attendancePercentage(present, total) {
  if (!Number.isFinite(present) || !Number.isFinite(total) || total <= 0) return 0
  return Math.round((present * 1000) / total) / 10
}

export function isSchoolEmail(email, configuredDomains = process.env.SCHOOL_EMAIL_DOMAINS || '') {
  const domains = configuredDomains
    .split(',')
    .map((domain) => domain.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean)
  return domains.includes(email.toLowerCase().split('@').pop())
}

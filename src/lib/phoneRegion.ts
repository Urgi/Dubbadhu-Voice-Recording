/**
 * Infer a display region from an E.164 phone via country calling code.
 * Lightweight (no libphonenumber). Longest prefixes match first.
 */

const CALLING_CODE_TO_REGION: Array<[string, string]> = [
  ['251', 'Ethiopia'],
  ['254', 'Kenya'],
  ['255', 'Tanzania'],
  ['256', 'Uganda'],
  ['250', 'Rwanda'],
  ['252', 'Somalia'],
  ['253', 'Djibouti'],
  ['291', 'Eritrea'],
  ['211', 'South Sudan'],
  ['249', 'Sudan'],
  ['234', 'Nigeria'],
  ['233', 'Ghana'],
  ['27', 'South Africa'],
  ['20', 'Egypt'],
  ['212', 'Morocco'],
  ['966', 'Saudi Arabia'],
  ['971', 'United Arab Emirates'],
  ['974', 'Qatar'],
  ['965', 'Kuwait'],
  ['973', 'Bahrain'],
  ['961', 'Lebanon'],
  ['44', 'United Kingdom'],
  ['49', 'Germany'],
  ['33', 'France'],
  ['39', 'Italy'],
  ['31', 'Netherlands'],
  ['46', 'Sweden'],
  ['47', 'Norway'],
  ['45', 'Denmark'],
  ['41', 'Switzerland'],
  ['61', 'Australia'],
  ['64', 'New Zealand'],
  ['81', 'Japan'],
  ['82', 'South Korea'],
  ['86', 'China'],
  ['91', 'India'],
  ['55', 'Brazil'],
  ['52', 'Mexico'],
  ['1', 'United States / Canada'],
]

export function regionFromPhone(phone: string | null | undefined): string {
  const digits = String(phone || '')
    .trim()
    .replace(/[^\d+]/g, '')
    .replace(/^\+/, '')
  if (!digits) return 'Unknown region'

  for (const [code, region] of CALLING_CODE_TO_REGION) {
    if (digits.startsWith(code)) return region
  }
  return 'Unknown region'
}

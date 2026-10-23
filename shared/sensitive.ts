/**
 * Cheap, deterministic sensitivity guards. Chats, calls and feeds are NOT sensitive in
 * themselves — they're Hypeman's favourite thing — but money, credentials, health, IDs and
 * dating profiles are.
 * They run *before* a frame is sent
 * (on the shared window/tab title) and *after* a line is generated (on the line).
 * The model is also instructed to stay silent on sensitive screens — this is the
 * belt to that pair of braces.
 */

const SENSITIVE_HINT_PATTERNS: RegExp[] = [
  // money
  /\bbank(ing)?\b/i,
  /\bstatement\b/i,
  /\bchecking\b|\bsavings\b/i,
  /\bbalance\b/i,
  /\bcredit ?card\b|\bdebit\b/i,
  /\bchase\b|\bwells ?fargo\b|\bbank of america\b|\bcitibank\b|\bbarclays\b|\bhsbc\b|\bsantander\b|\bcapital one\b|\bamex\b|\bamerican express\b/i,
  /\bpaypal\b|\bvenmo\b|\bcash ?app\b|\bzelle\b|\brevolut\b|\bmonzo\b|\bwise\b/i,
  /\bpayroll\b|\bpay ?stub\b|\bpayslip\b|\btax return\b|\bw-?2\b|\b1099\b|\birs\b|\bhmrc\b/i,
  /\bbrokerage\b|\bportfolio\b.*\b(fidelity|vanguard|schwab|robinhood)\b|\b(fidelity|vanguard|schwab|robinhood|coinbase)\b/i,
  // credentials
  /\bpassword(s)?\b|\bpasscode\b|\bpasskey\b|\b2fa\b|\bmfa\b|\bone-time code\b|\bverification code\b/i,
  /\b1password\b|\blastpass\b|\bbitwarden\b|\bdashlane\b|\bkeepass\b|\bkeychain\b/i,
  /\bsign[ -]?in\b|\blog[ -]?in\b|\bauthenticat(e|or|ion)\b/i,
  /\bapi[ _-]?key\b|\bsecret(s)?\b|\.env\b|\bcredentials?\b|\bprivate key\b|\bssh\b/i,
  // health
  /\bmedical\b|\bpatient\b|\bdiagnos(is|es)\b|\bprescription\b|\bpharmacy\b|\blab results?\b|\bmychart\b|\bhealth ?record\b|\btherapy\b|\btherapist\b/i,
  // identity
  /\bssn\b|\bsocial security\b|\bpassport\b|\bdriver'?s licen[cs]e\b|\bnational insurance\b/i,
  // budgeting / payroll / expenses
  /\bmint\b|\bmonarch money\b|\bynab\b|\bgusto\b|\badp\b|\bexpensify\b|\bquickbooks\b/i,
  /\bzocdoc\b|\bteladoc\b|\bpatient portal\b/i,
  // dating / very personal
  /\btinder\b|\bhinge\b|\bbumble\b|\bgrindr\b/i,
];

const SENSITIVE_LINE_PATTERNS: RegExp[] = [
  /[$€£¥]\s?\d/, // currency amounts
  /\b\d{1,3}(,\d{3})+(\.\d{2})?\b/, // 12,345.67-style numbers
  /\b\d+\.\d{2}\b/, // 123.45
  /\b\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{1,4}\b/, // card numbers
  /\b\d{3}-\d{2}-\d{4}\b/, // SSN
  /\b(account|routing|card) (number|no\.?|#)\b/i,
  /\bpassword\b|\bpasscode\b|\bpin\b/i,
  /\bbalance\b|\bbank\b|\bsalary\b|\bdebt\b|\boverdra(ft|wn)\b/i,
  /\bdiagnos|\bprescription\b|\bmedication\b|\bsymptom/i,
  /[\w.+-]+@[\w-]+\.[\w.]+/, // email addresses
  /\b\+?\d[\d ()-]{8,}\d\b/, // phone numbers
];

/** True if a shared surface's title suggests sensitive content. Empty/unknown → false. */
export function isSensitiveHint(hint: string | undefined | null): boolean {
  if (!hint) return false;
  return SENSITIVE_HINT_PATTERNS.some((re) => re.test(hint));
}

/** True if a generated line looks like it leaks something sensitive. */
export function lineLooksSensitive(line: string): boolean {
  return SENSITIVE_LINE_PATTERNS.some((re) => re.test(line));
}

/**
 * Browser track labels are sometimes opaque ids rather than titles
 * ("screen:0:0", "web-contents-media-stream://…"). Those carry no context.
 */
export function usefulHint(label: string | undefined | null): string | undefined {
  if (!label) return undefined;
  const l = label.trim();
  if (!l || /^(screen|window):\d/i.test(l) || /^web-contents-media-stream:/i.test(l) || /^entire screen$/i.test(l)) return undefined;
  return l.slice(0, 200);
}

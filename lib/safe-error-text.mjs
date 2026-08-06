const REDACTIONS = [
  [/postgres(?:ql)?:\/\/[^\s"']+/gi, "[redacted database URL]"],
  [/https:\/\/[a-z0-9]+\.supabase\.co[^\s"']*/gi, "[redacted Supabase URL]"],
  [/\b(?:sb_secret|sb_publishable)_[a-z0-9._-]+\b/gi, "[redacted Supabase key]"],
  [/\beyJ[a-z0-9_-]+\.eyJ[a-z0-9_-]+\.[a-z0-9_-]+\b/gi, "[redacted JWT]"],
  [/(password|token|secret|apikey|authorization)=([^&\s]+)/gi, "$1=[redacted]"],
];

export function redactSensitiveText(input) {
  return REDACTIONS.reduce(
    (result, [pattern, replacement]) => result.replace(pattern, replacement),
    input,
  );
}

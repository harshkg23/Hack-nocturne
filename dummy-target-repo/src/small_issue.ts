// Small issue: off-by-one/typo-style bug that is easy to fix.

export function formatGreeting(name: string): string {
  // BUG (small): extra punctuation and missing space make this look wrong.
  return `Hello,${name}!!`;
  // Correct would be: `Hello, ${name}!`
}


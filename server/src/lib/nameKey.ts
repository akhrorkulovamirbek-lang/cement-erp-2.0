// Буквы, которые выглядят одинаково в русском и латинском алфавите: в базе это разные символы,
// на экране — одно и то же слово.
const LOOKALIKE: Record<string, string> = { А: 'A', В: 'B', Е: 'E', К: 'K', М: 'M', Н: 'H', О: 'O', Р: 'P', С: 'C', Т: 'T', Х: 'X', У: 'Y' };

/** Ключ для сравнения имён «на глаз»: регистр, лишние пробелы и знаки, порядок слов и русские/латинские
 * «двойники» букв не важны. Два имени с одним ключом — почти наверняка один и тот же контрагент. */
export function nameKey(s: string): string {
  return s
    .toUpperCase()
    .split('')
    .map((ch) => LOOKALIKE[ch] ?? ch)
    .join('')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ');
}

export const lookalike = LOOKALIKE;

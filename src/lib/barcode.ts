/** Normalize GTINs without losing leading zeroes; reject bad check digits. */
export function validateBarcode(input: string): string | null {
  const code = input.replace(/[\s-]/g, "");
  if (!/^(?:\d{8}|\d{12}|\d{13})$/.test(code) || /^0+$/.test(code)) return null;
  let sum = 0;
  for (
    let i = code.length - 2, weight = 3;
    i >= 0;
    i--, weight = weight === 3 ? 1 : 3
  )
    sum += Number(code[i]) * weight;
  return (10 - (sum % 10)) % 10 === Number(code.at(-1)) ? code : null;
}
/** UPC-E's six compressed digits must be expanded before checksum validation. */
export function expandUPCE(code: string): string | null {
  if (!/^[01]\d{7}$/.test(code)) return null;
  const [n, a, b, c, d, e, f, k] = code;
  const body =
    Number(f) <= 2
      ? `${n}${a}${b}${f}0000${c}${d}${e}`
      : f === "3"
        ? `${n}${a}${b}${c}00000${d}${e}`
        : f === "4"
          ? `${n}${a}${b}${c}${d}00000${e}`
          : `${n}${a}${b}${c}${d}${e}0000${f}`;
  return validateBarcode(body + k);
}

export function csvCell(value: string): string {
  const protectedValue = /^[=+\-@\t\r\n]/.test(value) ? `'${value}` : value;
  return `"${protectedValue.replaceAll('"', '""')}"`;
}

/** A day as YYYY-MM-DD in the server's time zone: a late evening play is not the next day's. */
export const localDay = (date: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

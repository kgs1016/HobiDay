import { MOCK_ARTICLES, type Article } from "./community";

export const NEWS_PAGE = 20;
export function validNewsDate(value: string | null | undefined): string {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value ? value : "";
}
export function newsDate(iso: string) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}
export function newsFeedHref(date = "") {
  return `/community?tab=news${validNewsDate(date) ? `&date=${date}` : ""}`;
}
export function mockNewsPage(date: string, before?: Article) {
  return MOCK_ARTICLES.news.filter(a => !date || newsDate(a.published_at) === date)
    .sort((a, b) => b.published_at.localeCompare(a.published_at) || b.id.localeCompare(a.id))
    .filter(a => !before || a.published_at < before.published_at || (a.published_at === before.published_at && a.id < before.id))
    .slice(0, NEWS_PAGE);
}

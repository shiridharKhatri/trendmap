declare module "google-trends-api" {
  export interface InterestOverTimeOptions {
    keyword: string | string[];
    startTime?: Date;
    endTime?: Date;
    geo?: string;
    hl?: string;
    timezone?: number;
    category?: number;
    property?: string;
    resolution?: string;
  }

  export function interestOverTime(
    options: InterestOverTimeOptions,
    callback?: (err: any, results: any) => void
  ): Promise<string>;

  export function dailyTrends(
    options: { geo: string; trendDate?: Date; hl?: string; timezone?: number },
    callback?: (err: any, results: any) => void
  ): Promise<string>;

  export function realTimeTrends(
    options: { geo: string; category?: string; hl?: string; timezone?: number },
    callback?: (err: any, results: any) => void
  ): Promise<string>;

  export function relatedQueries(
    options: InterestOverTimeOptions,
    callback?: (err: any, results: any) => void
  ): Promise<string>;

  export function relatedTopics(
    options: InterestOverTimeOptions,
    callback?: (err: any, results: any) => void
  ): Promise<string>;

  export function autoComplete(
    options: { keyword: string; hl?: string },
    callback?: (err: any, results: any) => void
  ): Promise<string>;
}

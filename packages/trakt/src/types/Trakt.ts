interface GenericStore {
  get: (key: string) => Promise<Tokens | null>;
  set: (key: string, value: Tokens) => Promise<void>;
}

interface TraktOptions {
  clientId?: string;
  clientSecret?: string;
  baseUrl?: string;
  redirectUri?: string;
  store?: GenericStore;
}

interface Tokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope: string;
}

interface GetDeviceCodeOuptut {
  device_code: string;
  user_code: string;
  verification_url: string;
  expires_in: number;
  interval: number;
}

type ShowStatus =
  | 'returning series'
  | 'continuing'
  | 'in production'
  | 'planned'
  | 'upcoming'
  | 'pilot'
  | 'canceled'
  | 'ended';

interface ShowSummary {
  title: string;
  year: number;
  ids: {
    trakt: number;
    slug: string | null;
    tvdb: number | null;
    imdb: string | null;
    tmdb: number | null;
  };
}

interface ShowSummaryExtended extends ShowSummary {
  overview: string;
  firstAired: string;
  airs: {
    day: string;
    time: string;
    timezone: string;
  };
  runtime: number;
  certification: string;
  network: string;
  country: string;
  trailer: string;
  homepage: string;
  status: ShowStatus;
  rating: number;
  votes: number;
  commentCount: number;
  updatedAt: string;
  language: string;
  availableTranslations: string[];
  genres: string[];
  airedEpisodes: number;
}

export {
  GenericStore,
  TraktOptions,
  Tokens,
  GetDeviceCodeOuptut,
  ShowSummary,
  ShowSummaryExtended,
};

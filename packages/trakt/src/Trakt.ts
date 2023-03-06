import { default as request } from 'phin';
import type {
  GetDeviceCodeOuptut,
  GenericStore,
  TraktOptions,
  Tokens,
  ShowSummary,
  ShowSummaryExtended,
} from './types/Trakt';

export class Trakt {
  protected baseUrl: string = 'https://api.trakt.tv';
  protected clientId: string;
  protected clientSecret: string;
  protected redirectUri: string = 'urn:ietf:wg:oauth:2.0:oob';
  protected store?: GenericStore;
  protected tokens?: Tokens;

  public constructor(options: TraktOptions) {
    if (!options.clientId) throw new Error('Missing client id');
    if (!options.clientSecret) throw new Error('Missing client secret');
    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret;
    if (options.baseUrl) this.baseUrl = options.baseUrl;
    if (options.redirectUri) this.redirectUri = options.redirectUri;
    if (options.store) this.store = options.store;
  }

  public async auth(): Promise<void> {
    const tokens = await this.resolveTokens();

    if (tokens) return;

    const {
      device_code: deviceCode,
      user_code: userCode,
      verification_url: verificationUrl,
      expires_in: expiresIn,
      interval,
    } = await this.getDeviceCode();

    console.log(
      `Please go to ${verificationUrl} and enter the code ${userCode} to authenticate`
    );

    const startTime = Date.now();
    const endTime = startTime + expiresIn * 1000;

    while (Date.now() < endTime) {
      this.tokens = await this.getAccessTokens(deviceCode);

      if (this.tokens) {
        if (this.store) {
          await this.store.set('trakt-ts:tokens', this.tokens);
        }

        return;
      }

      await new Promise((resolve) => setTimeout(resolve, interval * 1000));
    }

    throw new Error('Timed out waiting for user to authenticate');
  }

  public async getShowSummary(id: string): Promise<ShowSummary>;
  public async getShowSummary(
    id: string,
    options?: {
      extended: true;
    }
  ): Promise<ShowSummaryExtended>;
  public async getShowSummary(
    id: string,
    options?: {
      extended: boolean;
    }
  ): Promise<unknown> {
    let query;
    if (options && options.extended) {
      query = { extended: 'full' };
    }
    const res = await request({
      url: `${this.baseUrl}/shows/${id}?${new URLSearchParams(query)}`,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'trakt-api-version': '2',
        'trakt-api-key': this.clientId,
      },
    });

    if (res.statusCode === 200) {
      return this.toCamelCase(JSON.parse(res.body.toString()));
    } else if (res.statusCode === 404) {
      throw new Error('Show not found');
    } else {
      throw new Error(
        `Error getting show summary, unexpected status code ${res.statusCode}`
      );
    }
  }

  protected areTokensExpired(tokens: Tokens): boolean {
    return tokens.expiresAt <= Date.now();
  }

  protected async checkOrRefreshTokens(tokens: Tokens): Promise<Tokens> {
    if (!this.areTokensExpired(tokens)) return tokens;
    this.tokens = await this.refreshTokens(tokens.refreshToken);

    if (this.store) {
      await this.store.set('trakt-ts:tokens', this.tokens);
    }

    return this.tokens;
  }

  protected async getAccessTokens(code: string): Promise<Tokens | undefined> {
    const res = await request({
      url: `${this.baseUrl}/oauth/device/token`,
      method: 'POST',
      data: {
        code: code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
      },
      headers: {
        'Content-Type': 'application/json',
        'trakt-api-version': '2',
        'trakt-api-key': this.clientId,
      },
    });

    if (res.statusCode === 200) {
      const {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: expiresIn,
        created_at: createdAt,
        scope,
      } = JSON.parse(res.body.toString());

      return {
        accessToken,
        refreshToken,
        expiresAt: createdAt + expiresIn * 1000,
        scope,
      };
    } else if (res.statusCode === 418) {
      throw new Error('User denied access to this code');
    } else if (res.statusCode === 404) {
      throw new Error('Invalid device code');
    } else if (res.statusCode === 410) {
      throw new Error('Tokens expired, please restart the process');
    } else if (res.statusCode === 400) {
      // User has not yet authorized the device

      return;
    } else {
      throw new Error(
        `An error occurred while getting access tokens: ${res.statusCode}`
      );
    }
  }

  protected async getDeviceCode(): Promise<GetDeviceCodeOuptut> {
    const res = await request({
      url: `${this.baseUrl}/oauth/device/code`,
      method: 'POST',
      data: {
        client_id: this.clientId,
      },
      headers: {
        'Content-Type': 'application/json',
        'trakt-api-version': '2',
        'trakt-api-key': this.clientId,
      },
    });

    if (res.statusCode !== 200) {
      throw new Error('Failed to get device code, check your client id');
    }

    return JSON.parse(res.body.toString());
  }

  protected async refreshTokens(refreshToken: string): Promise<Tokens> {
    const res = await request({
      url: `${this.baseUrl}/oauth/token`,
      method: 'POST',
      data: {
        refresh_token: refreshToken,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: this.redirectUri,
        grant_type: 'refresh_token',
      },
      headers: {
        'Content-Type': 'application/json',
        'trakt-api-version': '2',
        'trakt-api-key': this.clientId,
      },
    });

    if (res.statusCode === 200) {
      const {
        access_token: accessToken,
        refresh_token: newRefreshToken,
        expires_in: expiresIn,
        created_at: createdAt,
        scope,
      } = JSON.parse(res.body.toString());

      return {
        accessToken,
        refreshToken: newRefreshToken,
        expiresAt: createdAt + expiresIn * 1000,
        scope,
      };
    } else if (res.statusCode === 401) {
      const { error_description: errorDescription } = JSON.parse(
        res.body.toString()
      );

      throw new Error(errorDescription);
    } else {
      throw new Error(
        `An error occurred while refreshing tokens: ${res.statusCode}`
      );
    }
  }

  protected async resolveTokens(): Promise<Tokens | undefined> {
    if (this.tokens) return await this.checkOrRefreshTokens(this.tokens);

    if (this.store) {
      const tokens = await this.store.get('trakt-ts:tokens');
      if (tokens) return await this.checkOrRefreshTokens(tokens);
    }

    return;
  }

  protected toCamelCase(
    obj: Record<string, unknown> | unknown[] | unknown
  ): Record<string, unknown> | unknown[] | unknown {
    let rtn = obj;
    if (typeof obj === 'object') {
      if (Array.isArray(obj)) {
        rtn = [];
        for (let i = 0; i < obj.length; i++) {
          (rtn as unknown[])[i] = this.toCamelCase(obj[i]);
        }
      } else {
        rtn = {};
        for (const key in obj) {
          if (obj.hasOwnProperty(key)) {
            const newKey = key.replace(/(_\w)/g, (k) => k[1].toUpperCase());
            (rtn as Record<string, unknown>)[newKey] = this.toCamelCase(
              (obj as Record<string, unknown>)[key]
            );
          }
        }
      }
    }

    return rtn;
  }
}

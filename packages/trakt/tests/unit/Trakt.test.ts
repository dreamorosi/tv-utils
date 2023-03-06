/**
 * Test the Trakt class
 *
 * @group unit/trakt/all
 */

import { Trakt } from '../../src/Trakt';
import { rest } from 'msw';
import { setupServer } from 'msw/node';
import {
  GenericStore,
  GetDeviceCodeOuptut,
  Tokens,
  TraktOptions,
} from '../../src/types/Trakt';

describe('Class: Trakt', () => {
  const ENVIRONMENT_VARIABLES = process.env;

  const server = setupServer();

  beforeAll(() => {
    server.listen();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    process.env = { ...ENVIRONMENT_VARIABLES };
    server.resetHandlers();
  });

  afterAll(() => {
    process.env = ENVIRONMENT_VARIABLES;
    server.close();
  });

  describe('constructor', () => {
    class TraktDummy extends Trakt {
      public baseUrl!: string;
      public clientId!: string;
      public clientSecret!: string;
      public redirectUri!: string;
      public store?: GenericStore;

      public constructor(options: TraktOptions) {
        super(options);
      }
    }

    it('should throw an error if no client id is provided', () => {
      // Prepare & Act & Assert
      expect(() => {
        new Trakt({ clientSecret: 'secret' });
      }).toThrowError('Missing client id');
    });

    it('should throw an error if no client secret is provided', () => {
      // Prepare & Act & Assert
      expect(() => {
        new Trakt({ clientId: 'id' });
      }).toThrowError('Missing client secret');
    });

    it('should set the client id and client secret provided', () => {
      // Prepare
      const trakt = new TraktDummy({ clientId: 'id', clientSecret: 'secret' });

      // Act & Assert
      expect(trakt.clientId).toBe('id');
      expect(trakt.clientSecret).toBe('secret');
    });

    it('should set the base url provided', () => {
      // Prepare
      const trakt = new TraktDummy({
        clientId: 'id',
        clientSecret: 'secret',
        baseUrl: 'https://example.com',
      });

      // Act & Assert
      expect(trakt.baseUrl).toBe('https://example.com');
    });

    it('should set the redirect uri provided', () => {
      // Prepare
      const trakt = new TraktDummy({
        clientId: 'id',
        clientSecret: 'secret',
        redirectUri: 'https://example.com',
      });

      // Act & Assert
      expect(trakt.redirectUri).toBe('https://example.com');
    });

    it('should set the default base url when none is provided', () => {
      // Prepare
      const trakt = new TraktDummy({
        clientId: 'id',
        clientSecret: 'secret',
      });

      // Act & Assert
      expect(trakt.baseUrl).toBe('https://api.trakt.tv');
    });

    it('should set the default redirect uri when none is provided', () => {
      // Prepare
      const trakt = new TraktDummy({
        clientId: 'id',
        clientSecret: 'secret',
      });

      // Act & Assert
      expect(trakt.redirectUri).toBe('urn:ietf:wg:oauth:2.0:oob');
    });

    it('should set the provided store', () => {
      // Prepare
      const store = {
        get: jest.fn(),
        set: jest.fn(),
      };

      const trakt = new TraktDummy({
        clientId: 'id',
        clientSecret: 'secret',
        store,
      });

      // Act & Assert
      expect(trakt.store).toBe(store);
    });
  });

  describe('Method: auth', () => {
    class DummyStore implements GenericStore {
      public get = jest.fn();
      public set = jest.fn();
    }

    class TraktDummy extends Trakt {
      public getAccessTokens = jest.fn();
      public getDeviceCode = jest.fn();
      public resolveTokens = jest.fn();
      public store?: GenericStore;
      public tokens?: Tokens;

      public constructor(options: TraktOptions) {
        super(options);
      }
    }

    it('should return early if the tokens are not expired', async () => {
      // Prepare
      const trakt = new TraktDummy({
        clientId: 'id',
        clientSecret: 'secret',
      });

      const tokens = {
        accessToken: 'access',
        refreshToken: 'refresh',
        expiresAt: 1000,
      };
      trakt.resolveTokens = jest.fn().mockResolvedValue(tokens);

      // Act
      const result = await trakt.auth();

      // Assert
      expect(result).toBeUndefined();
      expect(trakt.resolveTokens).toHaveBeenCalledTimes(1);
      expect(trakt.getDeviceCode).not.toHaveBeenCalled();
      expect(trakt.getAccessTokens).not.toHaveBeenCalled();
    });

    it('should obtain a device code and log it when tokens are not available', async () => {
      // Prepare
      const trakt = new TraktDummy({
        clientId: 'id',
        clientSecret: 'secret',
      });

      const resolveTokensSpy = jest
        .spyOn(trakt, 'resolveTokens')
        .mockResolvedValue(undefined);
      jest.spyOn(trakt, 'getDeviceCode').mockResolvedValue({
        device_code: 'device',
        user_code: '1234',
        verification_url: 'http://example.com',
        expires_in: 5,
        interval: 0.01,
      });
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      jest.spyOn(trakt, 'getAccessTokens').mockResolvedValue({});

      // Act
      await trakt.auth();

      // Assert
      expect(resolveTokensSpy).toHaveBeenCalledTimes(1);
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Please go to http://example.com and enter the code 1234 to authenticate'
      );
    });

    it('should poll for access tokens after obtaining a device code', async () => {
      // Prepare
      const trakt = new TraktDummy({
        clientId: 'id',
        clientSecret: 'secret',
      });

      jest.spyOn(trakt, 'resolveTokens').mockResolvedValue(undefined);
      jest.spyOn(trakt, 'getDeviceCode').mockResolvedValue({
        device_code: 'device',
        user_code: '1234',
        verification_url: 'http://example.com',
        expires_in: 5,
        interval: 0.01,
      });
      jest.spyOn(console, 'log').mockImplementation();
      const getAccessTokensSpy = jest
        .spyOn(trakt, 'getAccessTokens')
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValue({});
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

      // Act
      await trakt.auth();

      // Assert
      expect(getAccessTokensSpy).toHaveBeenCalledTimes(3);
      expect(getAccessTokensSpy).toHaveBeenCalledWith('device');
      expect(setTimeoutSpy).toHaveBeenCalledTimes(2);
      expect(setTimeoutSpy).toHaveBeenCalledWith(
        expect.any(Function),
        0.01 * 1000
      );
    });

    it('should store the tokens in the class when they are obtained', async () => {
      // Prepare
      const trakt = new TraktDummy({
        clientId: 'id',
        clientSecret: 'secret',
      });

      jest.spyOn(trakt, 'resolveTokens').mockResolvedValue(undefined);
      jest.spyOn(trakt, 'getDeviceCode').mockResolvedValue({
        device_code: 'device',
        user_code: '1234',
        verification_url: 'http://example.com',
        expires_in: 5,
        interval: 0.01,
      });
      jest.spyOn(console, 'log').mockImplementation();
      const expectedTokens = {
        accessToken: 'access',
        refreshToken: 'refresh',
        expiresAt: 1000,
      };
      jest.spyOn(trakt, 'getAccessTokens').mockResolvedValue(expectedTokens);

      // Act
      await trakt.auth();

      // Assert
      expect(trakt.tokens).toEqual(expectedTokens);
    });

    it('should store the tokens in the store, when one is provided, when they are obtained', async () => {
      // Prepare
      const store = new DummyStore();
      const trakt = new TraktDummy({
        clientId: 'id',
        clientSecret: 'secret',
        store,
      });

      jest.spyOn(trakt, 'resolveTokens').mockResolvedValue(undefined);
      jest.spyOn(trakt, 'getDeviceCode').mockResolvedValue({
        device_code: 'device',
        user_code: '1234',
        verification_url: 'http://example.com',
        expires_in: 5,
        interval: 0.01,
      });
      jest.spyOn(console, 'log').mockImplementation();
      const expectedTokens = {
        accessToken: 'access',
        refreshToken: 'refresh',
        expiresAt: 1000,
      };
      jest.spyOn(trakt, 'getAccessTokens').mockResolvedValue(expectedTokens);

      // Act
      await trakt.auth();

      // Assert
      expect(store.set).toBeCalledTimes(1);
      expect(store.set).toBeCalledWith('trakt-ts:tokens', expectedTokens);
    });

    it('should throw an error if the device code is not obtained', async () => {
      // Prepare
      const trakt = new TraktDummy({
        clientId: 'id',
        clientSecret: 'secret',
      });

      jest.spyOn(trakt, 'resolveTokens').mockResolvedValue(undefined);
      jest.spyOn(trakt, 'getDeviceCode').mockResolvedValue({
        device_code: 'device',
        user_code: '1234',
        verification_url: 'http://example.com',
        expires_in: -5, // Negative value to force a timeout
        interval: 0.01,
      });
      jest.spyOn(console, 'log').mockImplementation();

      // Act & Assert
      await expect(trakt.auth()).rejects.toThrowError(
        'Timed out waiting for user to authenticate'
      );
    });
  });

  describe('Method: getShowSummary', () => {
    it('should return the show summary', async () => {
      // Prepare
      const trakt = new Trakt({
        clientId: 'id',
        clientSecret: 'secret',
      });

      const expectedShow = {
        title: 'title',
        year: 2020,
        ids: {
          trakt: 1,
        },
      };

      server.use(
        rest.get('https://api.trakt.tv/shows/1', (_req, res, ctx) =>
          res(ctx.status(200), ctx.json(expectedShow))
        )
      );

      // Act
      const show = await trakt.getShowSummary('1');

      // Assert
      expect(show).toEqual(expectedShow);
    });

    it('should throw the correct error if the show is not found', async () => {
      // Prepare
      const trakt = new Trakt({
        clientId: 'id',
        clientSecret: 'secret',
      });

      server.use(
        rest.get(
          'https://api.trakt.tv/shows/non-existent-show',
          (_req, res, ctx) => res(ctx.status(404))
        )
      );

      // Act & Assert
      await expect(
        trakt.getShowSummary('non-existent-show')
      ).rejects.toThrowError('Show not found');
    });

    it('should throw a generic error on other errors', async () => {
      // Prepare
      const trakt = new Trakt({
        clientId: 'id',
        clientSecret: 'secret',
      });

      server.use(
        rest.get('https://api.trakt.tv/shows/1', (_req, res, ctx) =>
          res(ctx.status(500))
        )
      );

      // Act & Assert
      await expect(trakt.getShowSummary('1')).rejects.toThrowError(
        `Error getting show summary, unexpected status code 500`
      );
    });

    it('should return the extended show summary when extended is true', async () => {
      // Prepare
      const trakt = new Trakt({
        clientId: 'id',
        clientSecret: 'secret',
      });

      const expectedShow = {
        title: 'title',
        year: 2020,
        ids: {
          trakt: 1,
        },
        overview: 'overview',
        first_aired: '2020-01-01',
      };

      server.use(
        rest.get('https://api.trakt.tv/shows/1', (_req, res, ctx) =>
          res(ctx.status(200), ctx.json(expectedShow))
        )
      );

      // Act
      const show = await trakt.getShowSummary('1', { extended: true });

      // Assert
      expect(show).toEqual({
        title: expectedShow.title,
        year: expectedShow.year,
        ids: expectedShow.ids,
        overview: expectedShow.overview,
        firstAired: expectedShow.first_aired,
      });
    });
  });

  describe('Method: areTokensExpired', () => {
    class TraktDummy extends Trakt {
      public constructor(options: TraktOptions) {
        super(options);
      }

      public areTokensExpired(tokens: Partial<Tokens>): boolean {
        return super.areTokensExpired(tokens as Tokens);
      }
    }

    it('should return true if the tokens are expired', () => {
      // Prepare
      const trakt = new TraktDummy({
        clientId: 'id',
        clientSecret: 'secret',
      });

      // Act & Assert
      const datePast = Date.now() - 1000;
      expect(trakt.areTokensExpired({ expiresAt: datePast })).toBe(true);
    });

    it('should return false if the tokens are not expired', () => {
      // Prepare
      const trakt = new TraktDummy({
        clientId: 'id',
        clientSecret: 'secret',
      });

      // Act & Assert
      const dateFuture = Date.now() + 1000;
      expect(trakt.areTokensExpired({ expiresAt: dateFuture })).toBe(false);
    });
  });

  describe('Method: checkOrRefreshTokens', () => {
    class DummyStore implements GenericStore {
      public get = jest.fn();
      public set = jest.fn();
    }

    class TraktDummy extends Trakt {
      public refreshTokens = jest.fn();
      public store?: GenericStore;
      public tokens?: Tokens | undefined;

      public constructor(options: TraktOptions) {
        super(options);
      }

      public async checkOrRefreshTokens(
        tokens: Partial<Tokens>
      ): Promise<Tokens> {
        return super.checkOrRefreshTokens(tokens as Tokens);
      }
    }

    it('should return the tokens if they are not expired', async () => {
      // Prepare
      const trakt = new TraktDummy({
        clientId: 'id',
        clientSecret: 'secret',
      });

      // Act & Assert
      const dateFuture = Date.now() + 1000;
      const tokens = { expiresAt: dateFuture };
      expect(await trakt.checkOrRefreshTokens(tokens)).toBe(tokens);
    });

    it('should refresh the tokens and update the class instance if they are expired', async () => {
      // Prepare
      const trakt = new TraktDummy({
        clientId: 'id',
        clientSecret: 'secret',
      });
      trakt.refreshTokens = jest.fn().mockResolvedValueOnce({
        accessToken: 'access',
      });

      // Act
      const datePast = Date.now() - 1000;
      const tokens = { expiresAt: datePast };
      await trakt.checkOrRefreshTokens(tokens);

      // Assert
      expect(trakt.refreshTokens).toBeCalledTimes(1);
      expect(trakt.tokens).toEqual({
        accessToken: 'access',
      });
    });

    it('should persist the tokens in the store when one is provided and the tokens are refreshed', async () => {
      // Prepare
      const store = new DummyStore();
      const trakt = new TraktDummy({
        clientId: 'id',
        clientSecret: 'secret',
        store,
      });
      trakt.refreshTokens = jest.fn().mockResolvedValueOnce({
        accessToken: 'access',
        refreshToken: 'refresh',
        expiresAt: 123,
      });

      // Act
      const datePast = Date.now() - 1000;
      const tokens = { expiresAt: datePast };
      await trakt.checkOrRefreshTokens(tokens);

      // Assert
      expect(store.set).toBeCalledTimes(1);
      expect(store.set).toBeCalledWith('trakt-ts:tokens', {
        accessToken: 'access',
        refreshToken: 'refresh',
        expiresAt: 123,
      });
    });

    it('should throw an error if unable to refresh the tokens', async () => {
      // Prepare
      const trakt = new TraktDummy({
        clientId: 'id',
        clientSecret: 'secret',
      });
      jest
        .spyOn(trakt, 'refreshTokens')
        .mockRejectedValueOnce(new Error('error'));

      // Act & Assert
      const datePast = Date.now() - 1000;
      const tokens = { expiresAt: datePast };
      await expect(trakt.checkOrRefreshTokens(tokens)).rejects.toThrowError();
    });
  });

  describe('Method: getAccessTokens', () => {
    class TraktDummy extends Trakt {
      public constructor(options: TraktOptions) {
        super(options);
      }

      public async getAccessTokens(code: string): Promise<Tokens | undefined> {
        return super.getAccessTokens(code);
      }
    }

    it('should throw an error when the request fails with an unknown status code', async () => {
      // Prepare
      server.use(
        rest.post('https://api.trakt.tv/oauth/device/token', (_req, res, ctx) =>
          res(ctx.status(403))
        )
      );

      const trakt = new TraktDummy({
        clientId: 'id',
        clientSecret: 'secret',
      });

      // Act & Assert
      await expect(trakt.getAccessTokens('code')).rejects.toThrowError(
        'An error occurred while getting access tokens: 403'
      );
    });

    it('should return silently when the request fails with a 400 status code', async () => {
      // Prepare
      server.use(
        rest.post('https://api.trakt.tv/oauth/device/token', (_req, res, ctx) =>
          res(ctx.status(400))
        )
      );

      const trakt = new TraktDummy({
        clientId: 'id',
        clientSecret: 'secret',
      });

      // Act
      const response = await trakt.getAccessTokens('code');

      // Assert
      expect(response).toBeUndefined();
    });

    it('should throw the proper error when the request fails with a 418 status code', async () => {
      // Prepare
      server.use(
        rest.post('https://api.trakt.tv/oauth/device/token', (_req, res, ctx) =>
          res(ctx.status(418))
        )
      );

      const trakt = new TraktDummy({
        clientId: 'id',
        clientSecret: 'secret',
      });

      // Act & Assert
      await expect(trakt.getAccessTokens('code')).rejects.toThrowError(
        'User denied access to this code'
      );
    });

    it('should throw the proper error when the request fails with a 404 status code', async () => {
      // Prepare
      server.use(
        rest.post('https://api.trakt.tv/oauth/device/token', (_req, res, ctx) =>
          res(ctx.status(404))
        )
      );

      const trakt = new TraktDummy({
        clientId: 'id',
        clientSecret: 'secret',
      });

      // Act & Assert
      await expect(trakt.getAccessTokens('code')).rejects.toThrowError(
        'Invalid device code'
      );
    });

    it('should throw the proper error when the request fails with a 410 status code', async () => {
      // Prepare
      server.use(
        rest.post('https://api.trakt.tv/oauth/device/token', (_req, res, ctx) =>
          res(ctx.status(410))
        )
      );

      const trakt = new TraktDummy({
        clientId: 'id',
        clientSecret: 'secret',
      });

      // Act & Assert
      await expect(trakt.getAccessTokens('code')).rejects.toThrowError(
        'Tokens expired, please restart the process'
      );
    });

    it('should return the proper response when the request succeeds', async () => {
      // Prepare
      server.use(
        rest.post('https://api.trakt.tv/oauth/device/token', (_req, res, ctx) =>
          res(
            ctx.status(200),
            ctx.json({
              access_token: 'access',
              refresh_token: 'refresh',
              expires_in: 100,
              created_at: 1000,
              scope: 'scope',
              token_type: 'bearer',
            })
          )
        )
      );

      const trakt = new TraktDummy({
        clientId: 'id',
        clientSecret: 'secret',
      });

      // Act
      const response = await trakt.getAccessTokens('code');

      // Assert
      expect(response).toEqual({
        accessToken: 'access',
        refreshToken: 'refresh',
        expiresAt: 101000,
        scope: 'scope',
      });
    });
  });

  describe('Method: getDeviceCode', () => {
    class TraktDummy extends Trakt {
      public constructor(options: TraktOptions) {
        super(options);
      }

      public async getDeviceCode(): Promise<GetDeviceCodeOuptut> {
        return super.getDeviceCode();
      }
    }

    it('should throw an error when the request fails', async () => {
      // Prepare
      server.use(
        rest.post('https://api.trakt.tv/oauth/device/code', (_req, res, ctx) =>
          res(ctx.status(403))
        )
      );
      const trakt = new TraktDummy({
        clientId: 'id',
        clientSecret: 'secret',
      });

      // Act & Assert
      await expect(trakt.getDeviceCode()).rejects.toThrowError('');
    });

    it('should return the proper response when the request succeeds', async () => {
      // Prepare
      server.use(
        rest.post('https://api.trakt.tv/oauth/device/code', (_req, res, ctx) =>
          res(
            ctx.status(200),
            ctx.json({
              device_code: 'device_code',
              user_code: 'user_code',
              verification_url: 'verification_url',
              expires_in: 100,
              interval: 5,
            })
          )
        )
      );
      const trakt = new TraktDummy({
        clientId: 'id',
        clientSecret: 'secret',
      });

      // Act
      const response = await trakt.getDeviceCode();

      // Assert
      expect(response).toEqual({
        device_code: 'device_code',
        user_code: 'user_code',
        verification_url: 'verification_url',
        expires_in: 100,
        interval: 5,
      });
    });
  });

  describe('Method: refreshTokens', () => {
    class TraktDummy extends Trakt {
      public constructor(options: TraktOptions) {
        super(options);
      }

      public async refreshTokens(refreshToken: string): Promise<Tokens> {
        return super.refreshTokens(refreshToken);
      }
    }

    it('should throw a generic error when the request fails with an unknown status code', async () => {
      // Prepare
      server.use(
        rest.post('https://api.trakt.tv/oauth/token', (_req, res, ctx) =>
          res(ctx.status(403))
        )
      );

      const trakt = new TraktDummy({
        clientId: 'id',
        clientSecret: 'secret',
      });

      // Act & Assert
      await expect(trakt.refreshTokens('refresh')).rejects.toThrowError(
        'An error occurred while refreshing tokens: 403'
      );
    });

    it('should throw the correct error when the request fails with a 401 status code', async () => {
      // Prepare
      server.use(
        rest.post('https://api.trakt.tv/oauth/token', (_req, res, ctx) =>
          res(
            ctx.status(401),
            ctx.json({
              error: 'invalid_grant',
              error_description: 'Some server provided error',
            })
          )
        )
      );

      const trakt = new TraktDummy({
        clientId: 'id',
        clientSecret: 'secret',
      });

      // Act & Assert
      await expect(trakt.refreshTokens('refresh')).rejects.toThrowError(
        'Some server provided error'
      );
    });

    it('should return the proper response when the request succeeds', async () => {
      // Prepare
      server.use(
        rest.post('https://api.trakt.tv/oauth/token', (_req, res, ctx) =>
          res(
            ctx.status(200),
            ctx.json({
              access_token: 'access',
              refresh_token: 'refresh',
              expires_in: 100,
              created_at: 1000,
              scope: 'scope',
            })
          )
        )
      );

      const trakt = new TraktDummy({
        clientId: 'id',
        clientSecret: 'secret',
      });

      // Act
      const response = await trakt.refreshTokens('refresh');

      // Assert
      expect(response).toEqual({
        accessToken: 'access',
        refreshToken: 'refresh',
        expiresAt: 101000,
        scope: 'scope',
      });
    });
  });

  describe('Method: resolveTokens', () => {
    class DummyStore implements GenericStore {
      public get = jest.fn();
      public set = jest.fn();
    }

    class TraktDummy extends Trakt {
      public checkOrRefreshTokens = jest.fn();
      public store?: GenericStore;
      public tokens?: Tokens | undefined;

      public constructor(options: TraktOptions, tokens?: Tokens | undefined) {
        super(options);
        this.tokens = tokens;
      }

      public async resolveTokens(): Promise<Tokens | undefined> {
        return super.resolveTokens();
      }
    }

    it('should return undefined when no tokens are available', async () => {
      // Prepare
      const trakt = new TraktDummy({
        clientId: 'id',
        clientSecret: 'secret',
      });

      // Act
      const tokens = await trakt.resolveTokens();

      // Assert
      expect(tokens).toBeUndefined();
    });

    it('should return the tokens from the class instance when available', async () => {
      // Prepare
      const expectedToken = {
        accessToken: 'access',
        refreshToken: 'refresh',
        expiresAt: 100,
        scope: 'scope',
      };
      const trakt = new TraktDummy(
        {
          clientId: 'id',
          clientSecret: 'secret',
        },
        expectedToken
      );
      const checkOrRefreshTokensSpy = jest
        .spyOn(trakt, 'checkOrRefreshTokens')
        .mockResolvedValue(expectedToken);

      // Act
      const tokens = await trakt.resolveTokens();

      // Assert
      expect(checkOrRefreshTokensSpy).toHaveBeenCalledWith(expectedToken);
      expect(checkOrRefreshTokensSpy).toHaveBeenCalledTimes(1);
      expect(tokens).toEqual(expectedToken);
    });

    it('should return the tokens from the store when available', async () => {
      // Prepare
      const expectedToken = {
        accessToken: 'access',
        refreshToken: 'refresh',
        expiresAt: 100,
        scope: 'scope',
      };
      const store = new DummyStore();
      store.get.mockResolvedValue(expectedToken);
      const trakt = new TraktDummy({
        clientId: 'id',
        clientSecret: 'secret',
        store,
      });
      const checkOrRefreshTokensSpy = jest
        .spyOn(trakt, 'checkOrRefreshTokens')
        .mockResolvedValue(expectedToken);

      // Act
      const tokens = await trakt.resolveTokens();

      // Assert
      expect(store.get).toHaveBeenCalledWith('trakt-ts:tokens');
      expect(store.get).toHaveBeenCalledTimes(1);
      expect(checkOrRefreshTokensSpy).toHaveBeenCalledWith(expectedToken);
      expect(checkOrRefreshTokensSpy).toHaveBeenCalledTimes(1);
      expect(tokens).toEqual(expectedToken);
    });
  });

  describe('Method: toCamelCase', () => {
    class TraktDummy extends Trakt {
      public constructor(options: TraktOptions) {
        super(options);
      }

      public toCamelCase(obj: unknown): unknown {
        return super.toCamelCase(obj);
      }
    }

    it('should return the same object when it is already camel cased', () => {
      // Prepare
      const trakt = new TraktDummy({
        clientId: 'id',
        clientSecret: 'secret',
      });

      // Act
      const result = trakt.toCamelCase({
        camelCase: 'camel',
        camelCase2: {
          camelCase3: 'camel',
        },
        camelCase4: [
          'camel',
          {
            camelCase5: 'camel',
          },
        ],
      });

      // Assert
      expect(result).toEqual({
        camelCase: 'camel',
        camelCase2: {
          camelCase3: 'camel',
        },
        camelCase4: [
          'camel',
          {
            camelCase5: 'camel',
          },
        ],
      });
    });

    it('should return a camel cased object when it is snake cased', () => {
      // Prepare
      const trakt = new TraktDummy({
        clientId: 'id',
        clientSecret: 'secret',
      });

      // Act
      const result = trakt.toCamelCase({
        snake_case: 'snake',
        snake_case_2: {
          snake_case_3: 'snake',
        },
        snake_case_4: [
          'snake',
          {
            snake_case_5: 'snake',
          },
        ],
      });

      // Assert
      expect(result).toEqual({
        snakeCase: 'snake',
        snakeCase2: {
          snakeCase3: 'snake',
        },
        snakeCase4: [
          'snake',
          {
            snakeCase5: 'snake',
          },
        ],
      });
    });
  });
});

import {
  Event,
  BrowserOptions,
  BrowserConfig as IBrowserConfig,
  Storage,
  TrackingOptions,
  TransportType,
  UserSession,
} from '@amplitude/analytics-types';
import { Config, MemoryStorage, UUID } from '@amplitude/analytics-core';

import { CookieStorage } from './storage/cookie';
import { FetchTransport } from './transports/fetch';
import { LocalStorage } from './storage/local-storage';
import { getCookieName } from './session-manager';
import { getQueryParams } from './utils/query-params';
import { XHRTransport } from './transports/xhr';
import { SendBeaconTransport } from './transports/send-beacon';

export const getDefaultConfig = () => ({
  cookieExpiration: 365,
  cookieSameSite: 'Lax',
  cookieSecure: false,
  cookieStorage: new MemoryStorage<UserSession>(),
  disableCookies: false,
  domain: '',
  includeGclid: true,
  includeFbclid: true,
  includeReferrer: true,
  includeUtm: true,
  sessionTimeout: 30 * 60 * 1000,
  storageProvider: new MemoryStorage<Event[]>(),
  trackingOptions: {
    city: true,
    country: true,
    carrier: true,
    deviceManufacturer: true,
    deviceModel: true,
    dma: true,
    ipAddress: true,
    language: true,
    osName: true,
    osVersion: true,
    platform: true,
    region: true,
    versionName: true,
  },
  transportProvider: new FetchTransport(),
});

export class BrowserConfig extends Config implements IBrowserConfig {
  appVersion?: string;
  cookieExpiration: number;
  cookieSameSite: string;
  cookieSecure: boolean;
  cookieStorage: Storage<UserSession>;
  deviceId?: string;
  disableCookies: boolean;
  domain: string;
  includeGclid: boolean;
  includeFbclid: boolean;
  includeReferrer: boolean;
  includeUtm: boolean;
  partnerId?: string;
  sessionId?: number;
  sessionTimeout: number;
  trackingOptions: TrackingOptions;
  userId?: string;

  constructor(apiKey: string, userId?: string, options?: BrowserOptions) {
    const defaultConfig = getDefaultConfig();
    super({
      ...options,
      apiKey,
      optOut: Boolean(options?.optOut),
      storageProvider: options?.storageProvider ?? defaultConfig.storageProvider,
      transportProvider: options?.transportProvider ?? defaultConfig.transportProvider,
    });

    this.appVersion = options?.appVersion;
    this.cookieExpiration = options?.cookieExpiration ?? defaultConfig.cookieExpiration;
    this.cookieSameSite = options?.cookieSameSite ?? defaultConfig.cookieSameSite;
    this.cookieSecure = options?.cookieSecure ?? defaultConfig.cookieSecure;
    this.cookieStorage = options?.cookieStorage ?? defaultConfig.cookieStorage;
    this.deviceId = options?.deviceId;
    this.disableCookies = options?.disableCookies ?? defaultConfig.disableCookies;
    this.domain = options?.domain ?? defaultConfig.domain;
    this.includeGclid = options?.includeGclid ?? defaultConfig.includeGclid;
    this.includeFbclid = options?.includeFbclid ?? defaultConfig.includeFbclid;
    this.includeReferrer = options?.includeReferrer ?? defaultConfig.includeReferrer;
    this.includeUtm = options?.includeUtm ?? defaultConfig.includeUtm;
    this.partnerId = options?.partnerId;
    this.sessionId = options?.sessionId;
    this.sessionTimeout = options?.sessionTimeout ?? defaultConfig.sessionTimeout;
    this.trackingOptions = options?.trackingOptions ?? defaultConfig.trackingOptions;
    this.userId = userId;
  }
}

export const useBrowserConfig = async (
  apiKey: string,
  userId?: string,
  options?: BrowserOptions,
): Promise<IBrowserConfig> => {
  const defaultConfig = getDefaultConfig();
  const cookieStorage = await createCookieStorage(options);
  const cookieName = getCookieName(apiKey);
  const cookies = await cookieStorage.get(cookieName);
  const queryParams = getQueryParams();
  const sessionTimeout = options?.sessionTimeout ?? defaultConfig.sessionTimeout;

  return new BrowserConfig(apiKey, userId ?? cookies?.userId, {
    ...options,
    cookieStorage,
    sessionTimeout,
    deviceId: createDeviceId(cookies?.deviceId, options?.deviceId, queryParams.deviceId),
    optOut: options?.optOut ?? Boolean(cookies?.optOut),
    sessionId: createSessionId(cookies?.sessionId, options?.sessionId, cookies?.lastEventTime, sessionTimeout),
    storageProvider: await createEventsStorage(options),
    trackingOptions: { ...defaultConfig.trackingOptions, ...options?.trackingOptions },
    transportProvider: options?.transportProvider ?? createTransport(options?.transport),
  });
};

export const createCookieStorage = async (
  overrides?: BrowserOptions,
  baseConfig = getDefaultConfig(),
): Promise<Storage<UserSession>> => {
  const options = { ...baseConfig, ...overrides };
  let cookieStorage = overrides?.cookieStorage;
  if (!cookieStorage || !(await cookieStorage.isEnabled())) {
    cookieStorage = new CookieStorage({
      domain: options.domain,
      expirationDays: options.cookieExpiration,
      sameSite: options.cookieSameSite,
      secure: options.cookieSecure,
    });
    if (options.disableCookies || !(await cookieStorage.isEnabled())) {
      cookieStorage = new LocalStorage();
      if (!(await cookieStorage.isEnabled())) {
        cookieStorage = new MemoryStorage();
      }
    }
  }
  return cookieStorage;
};

export const createEventsStorage = async (overrides?: BrowserOptions): Promise<Storage<Event[]>> => {
  let eventsStorage = overrides?.storageProvider;
  if (!eventsStorage || !(await eventsStorage.isEnabled())) {
    eventsStorage = new LocalStorage();
    if (!(await eventsStorage.isEnabled())) {
      eventsStorage = new MemoryStorage();
    }
  }
  return eventsStorage;
};

export const createDeviceId = (idFromCookies?: string, idFromOptions?: string, idFromQueryParams?: string) => {
  return idFromOptions || idFromQueryParams || idFromCookies || UUID();
};

export const createSessionId = (idFromCookies = 0, idFromOptions = 0, lastEventTime = 0, sessionTimeout: number) => {
  if (idFromCookies && Date.now() - lastEventTime < sessionTimeout) {
    return idFromCookies;
  }
  return idFromOptions ? idFromOptions : Date.now();
};

export const createTransport = (transport?: TransportType) => {
  if (transport === TransportType.XHR) {
    return new XHRTransport();
  }
  if (transport === TransportType.SendBeacon) {
    return new SendBeaconTransport();
  }
  return getDefaultConfig().transportProvider;
};

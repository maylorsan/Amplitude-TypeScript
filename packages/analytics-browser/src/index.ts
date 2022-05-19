import client from './browser-client';
export const {
  add,
  getDeviceId,
  getSessionId,
  getUserId,
  groupIdentify,
  identify,
  init,
  logEvent,
  remove,
  revenue,
  setDeviceId,
  setGroup,
  setOptOut,
  setSessionId,
  setTransport,
  setUserId,
  track,
} = client;
export { createInstance } from './browser-client';
export { runQueuedFunctions } from './utils/snippet-helper';
export { Revenue, Identify } from '@amplitude/analytics-core';
export * as Types from '@amplitude/analytics-types';

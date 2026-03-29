import { describe, test, expect } from 'bun:test';
import { RadikabuNaviClient } from '../radikabunavi-client.js';

describe('RadikabuNaviClient', () => {
  test('throws if API key is empty', () => {
    expect(() => new RadikabuNaviClient('')).toThrow('RADIKABUNAVI_API_KEY');
  });

  test('constructs with valid API key', () => {
    const client = new RadikabuNaviClient('rk_test_key');
    expect(client).toBeDefined();
  });
});

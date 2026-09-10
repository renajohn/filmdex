import axios from 'axios';
import request from 'supertest';
import app from '../../index';
import coverScanService from '../../src/services/coverScanService';

/**
 * Every failure without an HTTP response used to be reported as "Network
 * error: No response received". A container that cannot verify the mkcert
 * certificate in front of the model said exactly the same thing as a wrong
 * hostname or a refused connection, so the cover scan being down in
 * production took a layer-by-layer investigation to explain. The underlying
 * Node error code is what tells those apart.
 */

const axiosFailure = (over: Record<string, unknown>) =>
  Object.assign(new Error(String(over.message || 'failed')), {
    isAxiosError: true,
    request: {},
    ...over
  });

afterEach(() => {
  jest.restoreAllMocks();
});

describe('cover scan transport errors', () => {
  it('keeps the TLS failure code instead of a generic network message', async () => {
    jest.spyOn(axios, 'get').mockRejectedValue(
      axiosFailure({ code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', message: 'unable to verify the first certificate' })
    );

    const health = await coverScanService.checkHealth();

    expect(health.available).toBe(false);
    expect(health.error).toContain('UNABLE_TO_VERIFY_LEAF_SIGNATURE');
  });

  it('keeps a refused connection distinguishable from a bad hostname', async () => {
    jest.spyOn(axios, 'get').mockRejectedValue(
      axiosFailure({ code: 'ECONNREFUSED', message: 'connect ECONNREFUSED 127.0.0.1:8080' })
    );

    const health = await coverScanService.checkHealth();

    expect(health.error).toContain('ECONNREFUSED');
  });

  it('reports the code the underlying error carries when axios has none', async () => {
    jest.spyOn(axios, 'get').mockRejectedValue(
      axiosFailure({ message: 'unable to verify the first certificate', cause: { code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' } })
    );

    const health = await coverScanService.checkHealth();

    expect(health.error).toContain('UNABLE_TO_VERIFY_LEAF_SIGNATURE');
  });

  it('still answers 503 rather than 422, with the reason attached', async () => {
    // The controller decides between "service down" and "could not read the
    // sleeve" by matching the message, so the wording has to stay classifiable.
    jest.spyOn(coverScanService, 'analyzeAlbumImage').mockRejectedValue(
      new Error('Network error: UNABLE_TO_VERIFY_LEAF_SIGNATURE: unable to verify the first certificate')
    );

    const res = await request(app).post('/api/music/scan-cover').send({ image: 'aGVsbG8=' });

    expect(res.status).toBe(503);
    expect(res.body.details).toContain('UNABLE_TO_VERIFY_LEAF_SIGNATURE');
  });
});

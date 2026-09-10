import axios from 'axios';
import coverScanService from '../../src/services/coverScanService';

/**
 * Where the vision model lives is deployment-specific.
 *
 * In the container the default https host is reached through Traefik, which
 * serves a mkcert certificate that Node's bundled CA store cannot verify, so
 * every scan came back as "Cover scan service is not available". The
 * deployment has to be able to point the backend somewhere else -- for that
 * one, straight at the model over the internal network.
 */

const ORIGINAL_ENV = { ...process.env };

let coverJpeg: string;

beforeAll(async () => {
  const sharp = (await import('sharp')).default;
  coverJpeg = (
    await sharp({ create: { width: 320, height: 320, channels: 3, background: '#204060' } })
      .jpeg()
      .toBuffer()
  ).toString('base64');
});

afterEach(() => {
  jest.restoreAllMocks();
  process.env = { ...ORIGINAL_ENV };
});

const modelsReplying = () =>
  jest.spyOn(axios, 'get').mockResolvedValue({ data: { data: [{ id: 'Qwen3.6-35B-A3B' }] } } as never);

describe('cover scan endpoint configuration', () => {
  it('calls the lab host by default', async () => {
    const get = modelsReplying();

    await coverScanService.checkHealth();

    expect(get.mock.calls[0][0]).toBe('https://llm-next.lab.crog.org/v1/models');
  });

  it('lets the deployment point it elsewhere with LLM_BASE_URL', async () => {
    process.env.LLM_BASE_URL = 'http://next-mtp:8080';
    const get = modelsReplying();

    await coverScanService.checkHealth();

    expect(get.mock.calls[0][0]).toBe('http://next-mtp:8080/v1/models');
  });

  it('lets the deployment pick the model with LLM_MODEL', async () => {
    process.env.LLM_MODEL = 'some-other-model';
    const post = jest
      .spyOn(axios, 'post')
      .mockResolvedValue({ data: { choices: [{ message: { content: '{"title":"X"}' } }] } } as never);

    await coverScanService.analyzeImage(coverJpeg, 'image/jpeg');

    expect((post.mock.calls[0][1] as { model: string }).model).toBe('some-other-model');
  });
});

import http from 'http';
import type { AddressInfo } from 'net';
import request from 'supertest';
import app from '../../index';
import remoteService, { forgetPlayers } from '../../src/services/remoteService';

const STATE = {
  name: 'MacBook · Chrome', playing: true, album: { id: 7, title: 'Revolver', artist: 'The Beatles', cover: null },
  track: { title: 'Taxman', disc: 1, no: 1 }, index: 0, count: 14, position: 42, duration: 159, error: null,
};

/** A player listening on its own connection, saying it has each command when `answer`. */
const listening = async (port: number, id: string, answer = true) => {
  const received: Array<Record<string, unknown>> = [];
  const stream = await new Promise<http.IncomingMessage>(resolve => { http.get(`http://127.0.0.1:${port}/api/remote/players/${id}/commands`, resolve); });
  stream.setEncoding('utf8');
  stream.on('data', (chunk: string) => {
    for (const line of chunk.split('\n').filter(l => l.startsWith('data: '))) {
      const command = JSON.parse(line.slice(6));
      received.push(command);
      if (answer) http.request(`http://127.0.0.1:${port}/api/remote/acks/${command.id}`, { method: 'POST' }).end();
    }
  });
  return { stream, received };
};

beforeEach(() => forgetPlayers());

describe('the remote', () => {
  it('lists what each player plays, and refuses a command to one that does not listen', async () => {
    await request(app).put('/api/remote/players/mac').send(STATE).expect(204);
    expect((await request(app).get('/api/remote/players').expect(200)).body).toEqual([expect.objectContaining({ id: 'mac', ...STATE, online: false })]);
    await request(app).post('/api/remote/players/mac/commands').send({ action: 'next' }).expect(404);
    await request(app).post('/api/remote/players/mac/commands').send({ action: 'dance' }).expect(400);
    await request(app).post('/api/remote/players/mac/commands').send({ action: 'playAlbum' }).expect(400);
  });

  it('hands a player the commands sent to it, once it says it has them; to its newest page alone', async () => {
    const server = app.listen(0);
    const { port } = server.address() as AddressInfo;
    const old = await listening(port, 'mac');
    const mac = await listening(port, 'mac');
    try {
      expect(mac.stream.headers['content-type']).toMatch(/text\/event-stream/);
      expect((await request(app).get('/api/remote/players').expect(200)).body[0]).toMatchObject({ id: 'mac', online: true });
      await request(app).post('/api/remote/players/mac/commands').send({ action: 'toggle' }).expect(204);
      await request(app).post('/api/remote/players/mac/commands').send({ action: 'playAlbum', albumId: 7, index: 3 }).expect(204);
      expect(mac.received.map(({ id, ...command }) => command)).toEqual([{ action: 'toggle' }, { action: 'playAlbum', albumId: 7, index: 3, disc: 0 }]);
      expect(old.received).toEqual([]);
    } finally {
      old.stream.destroy();
      mac.stream.destroy();
      await new Promise(resolve => server.close(resolve));
    }
  });

  it('says when a computer listening does not answer, asleep', async () => {
    const server = app.listen(0);
    const { port } = server.address() as AddressInfo;
    const mac = await listening(port, 'mac', false);
    try {
      const answer = await request(app).post('/api/remote/players/mac/commands').send({ action: 'next' }).expect(504);
      expect(answer.body.error).toMatch(/does not answer/);
      expect(mac.received).toHaveLength(1);
    } finally {
      mac.stream.destroy();
      await new Promise(resolve => server.close(resolve));
    }
  });

  it('keeps of a report what it should say, and refuses an id a browser would not make', async () => {
    await request(app).put('/api/remote/players/mac').send({ ...STATE, album: { ...STATE.album, title: 'x'.repeat(5000), junk: 'y'.repeat(5000) }, extra: 1 }).expect(204);
    const [mac] = (await request(app).get('/api/remote/players').expect(200)).body;
    expect(mac.album.title).toHaveLength(200);
    expect(mac.album.junk).toBeUndefined();
    expect(mac.extra).toBeUndefined();
    await request(app).put('/api/remote/players/a-b').send(STATE).expect(400);
    await request(app).put('/api/remote/players/stranger/name').send({ name: 'Mine' }).expect(404);
  });

  it('takes a computer listening but long silent for asleep', async () => {
    const server = app.listen(0);
    const { port } = server.address() as AddressInfo;
    const mac = await listening(port, 'mac');
    try {
      await request(app).put('/api/remote/players/mac').send(STATE).expect(204);
      expect((await remoteService.list())[0].online).toBe(true);
      expect((await remoteService.list(Date.now() + 3 * 60_000))[0].online).toBe(false);
    } finally {
      mac.stream.destroy();
      await new Promise(resolve => server.close(resolve));
    }
  });

  it('keeps the name a computer is given, and when each started what it plays', async () => {
    await request(app).put('/api/remote/players/salon').send({ ...STATE, playing: false }).expect(204);
    await request(app).put('/api/remote/players/bureau').send(STATE).expect(204);
    await new Promise(resolve => setTimeout(resolve, 5));
    await request(app).put('/api/remote/players/salon').send(STATE).expect(204);
    await request(app).put('/api/remote/players/salon/name').send({ name: 'MacBook du salon' }).expect(204);

    const players = (await request(app).get('/api/remote/players').expect(200)).body as Array<{ id: string; name: string; startedAt: number }>;
    const salon = players.find(p => p.id === 'salon')!;
    const bureau = players.find(p => p.id === 'bureau')!;
    expect(salon.name).toBe('MacBook du salon');
    expect(bureau.name).toBe('MacBook · Chrome');
    expect(salon.startedAt).toBeGreaterThan(bureau.startedAt);
    // A report a while later, the same album still playing, does not start it again.
    await request(app).put('/api/remote/players/bureau').send({ ...STATE, position: 80 }).expect(204);
    expect(((await request(app).get('/api/remote/players').expect(200)).body as Array<{ id: string; startedAt: number }>).find(p => p.id === 'bureau')!.startedAt).toBe(bureau.startedAt);

    forgetPlayers();
    await request(app).put('/api/remote/players/salon').send(STATE).expect(204);
    expect((await request(app).get('/api/remote/players').expect(200)).body[0].name).toBe('MacBook du salon');
    await request(app).put('/api/remote/players/salon/name').send({ name: '' }).expect(204);
    expect((await request(app).get('/api/remote/players').expect(200)).body[0].name).toBe('MacBook · Chrome');
  });
});

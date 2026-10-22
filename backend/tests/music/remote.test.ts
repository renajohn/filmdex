import http from 'http';
import type { AddressInfo } from 'net';
import request from 'supertest';
import app from '../../index';
import { forgetPlayers } from '../../src/services/remoteService';

const STATE = {
  name: 'MacBook · Chrome', playing: true, album: { id: 7, title: 'Revolver', artist: 'The Beatles', cover: null },
  track: { title: 'Taxman', disc: 1, no: 1 }, index: 0, count: 14, position: 42, duration: 159,
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

  it('hands a player the commands sent to it, as they come', async () => {
    const server = app.listen(0);
    const { port } = server.address() as AddressInfo;
    const received: string[] = [];
    const stream = await new Promise<http.IncomingMessage>(resolve => {
      http.get(`http://127.0.0.1:${port}/api/remote/players/mac/commands`, resolve);
    });
    stream.setEncoding('utf8');
    stream.on('data', chunk => received.push(chunk));
    try {
      expect(stream.headers['content-type']).toMatch(/text\/event-stream/);
      expect((await request(app).get('/api/remote/players').expect(200)).body[0]).toMatchObject({ id: 'mac', online: true });
      await request(app).post('/api/remote/players/mac/commands').send({ action: 'toggle' }).expect(204);
      await request(app).post('/api/remote/players/mac/commands').send({ action: 'playAlbum', albumId: 7, index: 3 }).expect(204);
      await new Promise(resolve => setTimeout(resolve, 50));
      const commands = received.join('').split('\n').filter(line => line.startsWith('data: ')).map(line => JSON.parse(line.slice(6)));
      expect(commands).toEqual([{ action: 'toggle' }, { action: 'playAlbum', albumId: 7, index: 3, disc: 0 }]);
    } finally {
      stream.destroy();
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

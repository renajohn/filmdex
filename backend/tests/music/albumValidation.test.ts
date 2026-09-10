import request from 'supertest';
import app from '../../index';

describe('POST /api/music/albums — input validation', () => {
  it('answers 400, not 500, when the condition is not one the database accepts', async () => {
    const res = await request(app)
      .post('/api/music/albums')
      .send({ title: 'Bad Condition', artist: ['Test'], condition: 'Poor' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/condition/i);
  });

  it('answers 400 when the price is not a number', async () => {
    const res = await request(app)
      .post('/api/music/albums')
      .send({ title: 'Bad Price', artist: ['Test'], priceChf: 'douze' });

    expect(res.status).toBe(400);
  });

  it('still accepts a valid album', async () => {
    const res = await request(app)
      .post('/api/music/albums')
      .send({ title: 'Good Album', artist: ['Test'], condition: 'NM', priceChf: '19.90' });

    expect(res.status).toBe(201);
  });
});

import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from './server';
import path from 'path';
import fs from 'fs-extra';

describe('PDF Master API', () => {
  let app: any;

  beforeAll(async () => {
    app = await createApp();
    // Ensure test directories exist
    await fs.ensureDir(path.join(process.cwd(), 'uploads/original'));
    await fs.ensureDir(path.join(process.cwd(), 'uploads/processed'));
  });

  it('should return 400 if no file is uploaded', async () => {
    const response = await request(app).post('/api/upload');
    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  it('should reject non-uuid fileId in rotate request', async () => {
    const response = await request(app)
      .post('/api/pdf/rotate')
      .send({ fileId: 'invalid-id', degree: 90 });
    
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid operation');
  });

  it('should return 404 for non-existent file download', async () => {
    // Generate a valid-looking but non-existent UUID filename
    const fakeId = '00000000-0000-4000-a000-000000000000_rotated.pdf';
    const response = await request(app).get(`/api/pdf/download/${fakeId}`);
    expect(response.status).toBe(404);
  });

  it('should reject invalid filename patterns in download', async () => {
    const response = await request(app).get('/api/pdf/download/not-a-uuid_rotated.pdf');
    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Forbidden filename pattern');
  });

  it('should handle delete page request (validation check)', async () => {
    const response = await request(app)
      .post('/api/pdf/delete')
      .field('pages', '0')
      .field('pages', '1');
    // Should be 400 since no file is sent
    expect(response.status).toBe(400);
  });

  it('should handle split request (validation check)', async () => {
    const response = await request(app)
      .post('/api/pdf/split')
      .field('start', '1')
      .field('end', '5');
    // Should be 400 since no file is sent
    expect(response.status).toBe(400);
  });
});

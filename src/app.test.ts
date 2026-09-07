import request from 'supertest';
import app from './app';
import { AppError } from './utils/AppError';
import { otpGenerator } from './utils/otpGenerator';

// ==========================================
// 1. Integration Tests (Supertest APIs)
// ==========================================
describe('App Endpoints (Integration Tests)', () => {
  it('GET / - should return 200 and a welcome message', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe('Welcome to K10 Football Academy Platform API');
  });

  it('GET /health - should return 200 and health status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe('K10 Football Academy Platform API is healthy');
    expect(res.body.data).toHaveProperty('uptime');
  });

  it('GET /api/v1/invalid-route - should return 404', async () => {
    const res = await request(app).get('/api/v1/invalid-route');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

// ==========================================
// 2. Unit Tests (Utility Functions)
// ==========================================
describe('Utility Functions (Unit Tests)', () => {
  describe('otpGenerator.generate()', () => {
    it('should generate an OTP with default length 6', () => {
      const otp = otpGenerator.generate();
      expect(otp).toHaveLength(6);
      expect(Number(otp)).not.toBeNaN();
    });

    it('should generate an OTP with custom length', () => {
      const otp = otpGenerator.generate(4);
      expect(otp).toHaveLength(4);
      expect(Number(otp)).not.toBeNaN();
    });
  });

  describe('AppError Class', () => {
    it('should set statusCode and status correctly for 400 errors', () => {
      const error = new AppError(400, 'Bad Request');
      expect(error.statusCode).toBe(400);
      expect(error.status).toBe('fail');
      expect(error.message).toBe('Bad Request');
    });

    it('should set status to error for 500 status code', () => {
      const error = new AppError(500, 'Internal Server Error');
      expect(error.statusCode).toBe(500);
      expect(error.status).toBe('error');
    });
  });
});

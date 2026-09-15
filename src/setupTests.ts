import EventEmitter from 'events';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'mongodb://localhost:27017/test';
process.env.JWT_ACCESS_SECRET = 'test_access_secret';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret';
process.env.LOG_LEVEL = 'error';
process.env.SMTP_HOST = 'test.smtp.com';
process.env.SMTP_PORT = '587';
process.env.SMTP_USER = 'test@example.com';
process.env.SMTP_PASS = 'testpass';
process.env.SMTP_FROM = 'noreply@test.com';

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => {
    const emitter = new EventEmitter();
    /* eslint-disable @typescript-eslint/no-explicit-any */
    (emitter as any).call = jest.fn();
    (emitter as any).on = jest.fn();
    (emitter as any).quit = jest.fn().mockResolvedValue('OK');
    (emitter as any).disconnect = jest.fn();
    /* eslint-enable @typescript-eslint/no-explicit-any */
    return emitter;
  });
});

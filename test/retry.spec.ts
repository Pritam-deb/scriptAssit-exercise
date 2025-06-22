import { retry } from '../src/common/utils/retry';

describe('retry utility', () => {
  it('should succeed without retries if function resolves', async () => {
    const result = await retry(() => Promise.resolve('success'));
    expect(result).toBe('success');
  });

  it('should retry and eventually succeed', async () => {
    let attempts = 0;
    const result = await retry(
      () => {
        attempts++;
        if (attempts < 3) {
          return Promise.reject(new Error('fail'));
        }
        return Promise.resolve('ok');
      },
      { attempts: 5, delayMs: 10 },
    );

    expect(result).toBe('ok');
    expect(attempts).toBe(3);
  });

  it('should fail after max retries', async () => {
    let attempts = 0;
    await expect(
      retry(
        () => {
          attempts++;
          return Promise.reject(new Error('always fails'));
        },
        { attempts: 3, delayMs: 5 },
      ),
    ).rejects.toThrow('always fails');
    expect(attempts).toBe(3);
  });
});

/**
 * Worker 消息层集成测试：模拟 self 全局，验证
 * 请求/响应的 requestId 对应关系与错误消息映射。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IsolateRequest, WorkerResponse } from '../src/worker/sturmWorker';

interface SelfMock {
  onmessage: ((e: { data: IsolateRequest }) => void) | null;
  postMessage: ReturnType<typeof vi.fn>;
}

const setupWorker = async (): Promise<SelfMock> => {
  vi.resetModules();
  const selfMock: SelfMock = {
    onmessage: null,
    postMessage: vi.fn(),
  };
  vi.stubGlobal('self', selfMock);
  await import('../src/worker/sturmWorker');
  return selfMock;
};

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe('Worker 消息处理', () => {
  it('正常输入返回 result 消息且 requestId 一致', async () => {
    const selfMock = await setupWorker();
    expect(selfMock.onmessage).toBeTypeOf('function');

    selfMock.onmessage!({
      data: { type: 'isolate', requestId: 7, coeffs: '1, -3, 2', a: '0', b: '5' },
    });

    expect(selfMock.postMessage).toHaveBeenCalledTimes(1);
    const msg = selfMock.postMessage.mock.calls[0][0] as WorkerResponse;
    expect(msg.type).toBe('result');
    expect(msg.requestId).toBe(7);
    if (msg.type === 'result') {
      expect(msg.result.totalRoots).toBe(2);
      expect(msg.result.intervals).toHaveLength(2);
    }
  });

  it('切触后穿越的三次曲线返回两段区间且逐段证据一致', async () => {
    const selfMock = await setupWorker();
    // (2x−3)^2·(x−4) = 4x^3 − 28x^2 + 57x − 36：x=3/2 切触零线，x=4 穿越零线
    selfMock.onmessage!({
      data: {
        type: 'isolate',
        requestId: 11,
        coeffs: '4, -28, 57, -36',
        a: '0',
        b: '5',
      },
    });
    const msg = selfMock.postMessage.mock.calls[0][0] as WorkerResponse;
    expect(msg.type).toBe('result');
    expect(msg.requestId).toBe(11);
    if (msg.type === 'result') {
      expect(msg.result.totalRoots).toBe(2);
      // 根数、区间清单与逐段证据必须相互一致
      expect(msg.result.intervals).toHaveLength(2);
      const [u, v] = msg.result.intervals;
      expect(Number(u.lDec)).toBeLessThan(1.5);
      expect(Number(u.rDec)).toBeGreaterThan(1.5);
      expect(Number(v.lDec)).toBeLessThan(4);
      expect(Number(v.rDec)).toBeGreaterThan(4);
      for (const iv of msg.result.intervals) {
        expect(iv.vL - iv.vR).toBe(1);
      }
    }
  });

  it('端点为根返回 error 消息且 code 为 ENDPOINT_ROOT', async () => {
    const selfMock = await setupWorker();
    selfMock.onmessage!({
      data: { type: 'isolate', requestId: 9, coeffs: '1, -3, 2', a: '1', b: '5' },
    });
    const msg = selfMock.postMessage.mock.calls[0][0] as WorkerResponse;
    expect(msg.type).toBe('error');
    expect(msg.requestId).toBe(9);
    if (msg.type === 'error') {
      expect(msg.error.code).toBe('ENDPOINT_ROOT');
      expect(msg.error.message).toMatch(/根/);
    }
  });

  it('系数格式错误返回 error 消息且 code 为 BAD_FORMAT', async () => {
    const selfMock = await setupWorker();
    selfMock.onmessage!({
      data: { type: 'isolate', requestId: 3, coeffs: '1, x, 2', a: '0', b: '5' },
    });
    const msg = selfMock.postMessage.mock.calls[0][0] as WorkerResponse;
    expect(msg.type).toBe('error');
    if (msg.type === 'error') {
      expect(msg.error.code).toBe('BAD_FORMAT');
    }
  });

  it('无实根情形返回 totalRoots = 0 的 result 消息', async () => {
    const selfMock = await setupWorker();
    selfMock.onmessage!({
      data: { type: 'isolate', requestId: 4, coeffs: '1, 0, 1', a: '-10', b: '10' },
    });
    const msg = selfMock.postMessage.mock.calls[0][0] as WorkerResponse;
    expect(msg.type).toBe('result');
    if (msg.type === 'result') {
      expect(msg.result.totalRoots).toBe(0);
      expect(msg.result.intervals).toHaveLength(0);
    }
  });
});

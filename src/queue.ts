/*
 * @Description: xxx
 * @Author: lzc
 * @Date: 2020/12/22 19:12:53
 */

import { AxiosRequestConfig, Canceler } from 'axios';

export interface RequestConfigInterface extends AxiosRequestConfig {
  requestId: string;
  cancelExecutor: Canceler;
}

class Queue {
  private queue: Array<RequestConfigInterface> = [];

  /**
   * 获取队列请求项
   * @param id
   */
  public get(id: string): Array<RequestConfigInterface> {
    if (typeof id === 'undefined') {
      return this.queue;
    }
    return this.queue.filter(item => item.requestId === id);
  }

  /**
   * 添加进队列
   * @param config
   */
  public set(config: RequestConfigInterface): void {
    this.queue.push(config);
  }

  /**
   * 删除队列
   * @param id
   */
  public delete(id: string): void {
    this.queue = [...this.queue.filter(v => v.requestId !== id)];
  }

  /**
   * 取消执行
   * @param ids
   * @param msg
   */
  public cancel(ids: undefined|string|string[], msg = 'request canceled'): Promise<boolean> {
    let cancelQueue: Array<RequestConfigInterface> = [];
    if (typeof ids === 'undefined') {
      cancelQueue = [...this.queue];
    } else if (Array.isArray(ids)) {
      ids.forEach(id => {
        const cancelRequest = this.get(id);
        if (cancelRequest) {
          cancelQueue = [...cancelQueue, ...cancelRequest];
        }
      });
    } else {
      const cancelRequest = this.get(ids);
      cancelQueue = [...cancelRequest];
    }

    try {
      cancelQueue.forEach(({ requestId, cancelExecutor }) => {
        this.delete(requestId);
        cancelExecutor(msg);
      });
      return Promise.resolve(true);
    } catch (error) {
      return Promise.reject(error);
    }
  }
}

export default Queue;

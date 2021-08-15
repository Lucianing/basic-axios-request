/*
 * @Description: xxx
 * @Author: lzc
 * @Date: 2020/12/22 18:49:55
 */
import axios, {
  AxiosError,
  AxiosInstance,
  AxiosInterceptorManager,
  AxiosPromise,
  AxiosRequestConfig,
  AxiosResponse,
  Canceler,
  CancelToken
} from 'axios';
import Queue from './queue';

export interface BasicAxiosRequestConfig extends  AxiosRequestConfig{
  requestId?: string;
  downloadFileName?: string;
  manualDownload?: boolean;
  isDownloadFile?: boolean;
  manualHandle?: boolean;
  [k: string]: any;
}

export interface BasicAxiosResponse<T = any> extends Omit<AxiosResponse<T>, 'config'> {
  config: BasicAxiosRequestConfig;
}

export interface BasicAxios extends AxiosInstance {
  cancel?: (requestId: string | Array<string>) => void;
  (config: BasicAxiosRequestConfig): AxiosPromise;
  (url: string, config?: BasicAxiosRequestConfig): AxiosPromise;
  defaults: BasicAxiosRequestConfig;
  interceptors: {
    request: AxiosInterceptorManager<BasicAxiosRequestConfig>;
    response: AxiosInterceptorManager<BasicAxiosResponse>;
  };
  getUri(config?: BasicAxiosRequestConfig): string;
  request<T = any, R = BasicAxiosResponse<T>>(config: BasicAxiosRequestConfig): Promise<R>;
  get<T = any, R = BasicAxiosResponse<T>>(url: string, config?: BasicAxiosRequestConfig): Promise<R>;
  delete<T = any, R = BasicAxiosResponse<T>>(url: string, config?: BasicAxiosRequestConfig): Promise<R>;
  head<T = any, R = BasicAxiosResponse<T>>(url: string, config?: BasicAxiosRequestConfig): Promise<R>;
  options<T = any, R = BasicAxiosResponse<T>>(url: string, config?: BasicAxiosRequestConfig): Promise<R>;
  post<T = any, R = BasicAxiosResponse<T>>(url: string, data?: any, config?: BasicAxiosRequestConfig): Promise<R>;
  put<T = any, R = BasicAxiosResponse<T>>(url: string, data?: any, config?: BasicAxiosRequestConfig): Promise<R>;
  patch<T = any, R = BasicAxiosResponse<T>>(url: string, data?: any, config?: BasicAxiosRequestConfig): Promise<R>;
}

export type Token = {
  accessToken: string;
  refreshToken: string
}

export type BasicAxiosRequestParams = {
  /* 获取accessToken以及refreshToken */
  getToken?: () => Token | Promise<Token>;

  /* 根据refresh_token获取新的access_token */
  updateAccessToken?: (request: BasicAxios, oldRefreshToken: string) => string | Promise<string>;

  /* 是否采用refresh_token和access_token 默认逻辑，默认为true，设置为false的时候，自行拦截处理默认逻辑  */
  enabledDefaultLogic?: boolean;

  /* access_token有效时间，毫秒，从accessToken接口返回的时候开始计算 */
  accessTokenExpires: number | (() => number);

  /* Axios 配置 */
  axiosCreateConfig?: BasicAxiosRequestConfig;

  /* 白名单接口 */
  whitelist?: string[];

  /* 请求前拦截处理 */
  beforeRequest?: (config: BasicAxiosRequestConfig, whitelist: string[]) => BasicAxiosRequestConfig | Promise<BasicAxiosRequestConfig> | void;

  /* 请求响应后拦截 */
  afterResponse?: (response: BasicAxiosResponse) => any

  /* 响应错误后处理 */
  onResponseReject?: (error: AxiosError) => any;

  /* 退出登录 */
  logout?: () => void;

  /* 失效时间内请求刷新token，单位秒，默认15分钟 */
  accessTokenInvalid?: number;
}

export type Response<T extends object = {}> = {
  code: number;
  data: T;
  msg?: string
}

export type CancelTokenProps = {
  cancelToken: CancelToken;
  cancelExecutor: Canceler;
}

export interface BasicRequestConfig extends AxiosRequestConfig {
  requestId?: string;
  hideDefaultError?: boolean;
}

/**
 * 获取cancelToken和取消执行的方法cancelExecutor
 */
const getCancelToken = (): CancelTokenProps => {
  // 执行axios.CancelToken的时候会在回调重新赋值cancelExecutor，axios有点奇怪～～～
  let cancelExecutor: Canceler = (): void => { /**/
  };
  const cancelToken = new axios.CancelToken((executor) => {
    cancelExecutor = executor;
  });
  return {
    cancelToken,
    cancelExecutor
  };
};

// 在请求刷新token的时候，其他接口并发请求的队列
let requestQueueWhenGetRefreshToken = [];

// 是否处于正在请求刷新token状态
let isPendingRefreshToken = false;

// 请求队列
const queue = new Queue();

const MIN = 2 * 60 * 1000;
const MAX = 15 * 60 * 1000;

export default ({
  axiosCreateConfig,
  beforeRequest,
  logout,
  updateAccessToken,
  afterResponse,
  onResponseReject,
  getToken,
  enabledDefaultLogic = true,
  accessTokenExpires,
  whitelist = [],
  accessTokenInvalid = 900
}: BasicAxiosRequestParams): BasicAxios => {
  const Http: BasicAxios = axios.create(axiosCreateConfig);

  // 获取刷新token
  const fetchRefreshToken = async (config, oldRefreshToken, resolve) => {
    if (typeof updateAccessToken === 'function') {
      const accessToken = await updateAccessToken(Http, oldRefreshToken);
      isPendingRefreshToken = false;
      if (!accessToken) {
        typeof logout === 'function' && logout();
        return Promise.reject('请求刷新token，调用updateAccessToken没返回');
      }
      config.headers['Authorization'] = `Bearer ${accessToken}`;
      resolve(config);
      requestQueueWhenGetRefreshToken.forEach(callback => callback(accessToken));
      requestQueueWhenGetRefreshToken = [];
    }
  };

  // 请求拦截
  Http.interceptors.request.use(
    async (options: BasicRequestConfig) => {
      try {
        let config = {
          ...options,
          ...(getCancelToken()),
          requestId: options.requestId || options.method + '_' + options.url,
        };

        if (enabledDefaultLogic && !whitelist.some(api => config.url.endsWith(api))) {
          const { accessToken, refreshToken } = await getToken();
          const expiresTime = typeof accessTokenExpires === 'function'
            ? (Number(accessTokenExpires()))
            : (Number(accessTokenExpires));
          if (accessToken && !isNaN(expiresTime)) {
            // 如果当前时间距离过期时间还剩2分钟 或者 当前时间已经过期但是过期时间在15分钟内，则重新请求刷新token更新数据
            // 如果当前已经过期超过15分钟，直接退出
            const curTime = (new Date()).valueOf();
            const dis = curTime - expiresTime;
            if (dis <= -MIN) {
              // 有效时间内 
              config.headers['Authorization'] = `Bearer ${accessToken}`;
            } else if (dis > -MIN && dis <= MAX) {
              // 刷新token
              if (!isPendingRefreshToken) {
                isPendingRefreshToken = true;
                return new Promise<BasicRequestConfig>(resolve => {
                  fetchRefreshToken(config, refreshToken, resolve);
                });
              } else {
                return new Promise(resolve => {
                  requestQueueWhenGetRefreshToken.push(token => {
                    config.headers['Authorization'] = `Bearer ${token}`;
                    queue.set(config);
                    resolve(config);
                  });
                });
              }
            } else {
              // 退出
              typeof logout === 'function' && await logout();
              return Promise.reject('access_token失效时间过长，自动退出登录');
            }
          } else {
            typeof logout === 'function' && await logout();
            return Promise.reject('access_token不存在或没有配置accessTokenExpires access_token 失效时间戳');
          }
        }

        // 外部扩展
        if (typeof beforeRequest === 'function') {
          const extend = await beforeRequest(config, whitelist);
          if (extend && Object.prototype.toString.call(extend) === '[object Object]') {
            config = { ...config, ...extend };
          }
        }

        // 添加进请求队列
        queue.set(config);

        return config;
      } catch (e) {
        throw new Error(e)
      }
    },
    error => {
      return Promise.reject(error);
    }
  );

  Http.interceptors.response.use(
    async (response) => {
      const { data } = response;

      if (typeof afterResponse === 'function') {
        const res = await afterResponse(response);
        if (res) return res;
      }

      return data;
    },
    async (error) => {
      if (typeof onResponseReject === 'function') {
        const res = await onResponseReject(error);
        if (res) return res;
      }
      return error;
    }
  );

  Http.cancel = (requestId: string | Array<string>): void => {
    queue.cancel(requestId);
  };

  return Http;
}

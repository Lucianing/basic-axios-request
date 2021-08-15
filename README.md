# basic-axios-request

基于axios基础请求封装，主要功能：

    + accessToken 在时间范围内过期后自动更新请求,在请求刷新token返回前，其他请求在队列中挂起状态，刷新token返回后重新请求
    + 主动取消请求
    + Axios请求拦截、响应拦截
 
## 使用

安装
```bash
yarn add basic-axios-request
```

在项目 `src/utils` 中 新建 Http 文件

```ts
import basicAxiosRequest from 'basic-axios-request';

export default basicAxiosRequest({
  axiosCreateConfig: {
    baseURL: '/api',
  },
  whitelist: ['/auth/refreshtoken'],
  getToken() {
    const { accessToken, refreshToken } = JSON.parse(window.localStorage.getItem('authData'));
    return { accessToken, refreshToken }
  },
  async updateAccessToken(request, oldRefreshToken) {
    const res = await request.post('/upms/auth/refreshtoken', {
      authorization: 'cG9ydGFs*****udDpidddd===',
      refresh_token: oldRefreshToken,
    });
    if (res?.code === 0) {
      // 获取新的数据后保存到本地。。。
      window.localStorage.setItem('authData', JSON.stringify({accessToken: res?.data.access_token, refreshToken: res?.data.refresh_token}))
      return res?.data.access_token
    }
  }
});
```

## API


| 属性                | 说明                                                                                                | 类型                                                       | 默认值                            |
| :------------------ | :-------------------------------------------------------------------------------------------------- | :--------------------------------------------------------- | :-------------------------------- |
| enabledDefaultLogic | 是否采用accessToken、refreshToken逻辑，默认为true，否则自行设置`beforeRequest`和`afterResponse`处理 | `boolean`                                                  | `true`                            |
| getToken            | 获取accessToken、refreshToken方法                                                                   | `() => ({accessToken: string; refreshToken: string})`      | `enabledDefaultLogic为true时必填` |
| updateAccessToken   | 获取新的accessToken方法,返回accessToken，在accessToken还有5分钟，或者默认过期15分钟内会重新调用请求 | `() => string`                                             | `enabledDefaultLogic为true时必填` |
| accessTokenExpires  | accessToken有过期时间，单位毫秒                                                                     | `number`                                                   | `-`                               |
| axiosCreateConfig   | `axios.create` 方法参数配置                                                                         | `AxiosRequestConfig`                                       | -                                 |
| whitelist           | 接口白名单，不需要带accessToken                                                                     | `string[]`                                                 | []                                |
| beforeRequest       | axios request 拦截函数，如果有返回值，则返回的，没有拦截返回默认的请求配置                          | `(config: AxiosRequestConfig) => AxiosRequestConfig｜void` | -                                 |
| afterResponse       | axios response 拦截函数，如果有返回值，则返回的，没有拦截返回默认的请求配置                         | `(response: AxiosResponse) => any`                         | -                                 |
| onResponseReject    | response响应错误后处理                                                                              | `(error: AxiosError) => any`                               | -                                 |
| logout              | accessToken超过有效时长太久，需要退出登录处理等                                                     | `() => void`                                               | -                                 |
| accessTokenInvalid  | accessToken失效时长多久范围内，允许重新请求更新，默认900秒（15分钟）                                | `number`                                                   | 900                               |

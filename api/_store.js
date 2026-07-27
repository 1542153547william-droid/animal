// ============================================================
// api/_store.js  —  存储适配层（后端内部使用）
// ------------------------------------------------------------
// 当前：内存 Map（Vercel 冷启动会清零，仅作演示 / 本地开发）
// 生产：把下面 get/save 两个函数换成 Upstash Redis / 腾讯云 CloudBase
//       接口保持不变，上层 _petCore.js 与前端都不用改。
// ============================================================

const memory = new Map();

export const store = {
  async get(petId) {
    return memory.get(petId) || null;
  },
  async save(petId, state) {
    memory.set(petId, state);
    return state;
  },
};

// —— 接 Upstash Redis 示例（取消注释并装 @upstash/redis）——
// import { Redis } from '@upstash/redis';
// const redis = Redis.fromEnv();
// export const store = {
//   async get(id) { return await redis.get(`pet:${id}`); },
//   async save(id, s) { await redis.set(`pet:${id}`, s); return s; },
// };

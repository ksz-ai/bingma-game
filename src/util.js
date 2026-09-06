/* 通用小工具 */
export const $ = id => document.getElementById(id);
export const now = () => performance.now() / 1000;
export const pick = a => a[Math.floor(Math.random() * a.length)];

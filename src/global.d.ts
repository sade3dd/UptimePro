declare module "*.html" {
  const content: string;
  export default content;
}

declare module "*.css" {
  const content: string;
  export default content;
}

declare module "*.txt" {
  const content: string;
  export default content;
}
// 告诉 TS：所有以 .html?raw 结尾的导入都是字符串
declare module "*?raw" {
  const content: string;
  export default content;
}

// 如果你以后还会用到图片或其它资源也可以顺便定义
declare module "*.html" {
  const content: string;
  export default content;
}
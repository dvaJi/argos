// `?asset` import — replaces the equivalent ambient declaration from
// `electron-vite/node`. Resolves to the runtime filesystem path of the file.
declare module "*?asset" {
  const src: string;
  export default src;
}

declare module "*?asset&asarUnpack" {
  const src: string;
  export default src;
}

declare module "*?raw" {
  const src: string;
  export default src;
}

declare namespace NodeJS {
  interface Process {
    electronApp?: import("node:child_process").ChildProcess;
  }
}

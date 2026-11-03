export const escapeLike = (s: string) => s.replace(/[\\%_]/g, "\\$&");
